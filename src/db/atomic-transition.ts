/**
 * Purpose: Orchestrate optimistic transitions when there are no real Mongo 
 * transactions, avoiding corrupt states due to race conditions.
 * Context: Low-level helper for repositories that use compare-and-swap
 * based on snapshots calculated by the caller.
 * Key Dependencies: `Result` utilities (to avoid throwing) and repository 
 * callbacks with specific knowledge of the data structure.
 * Invariants: `getSnapshot` must be deterministic relative to the received 
 * user, `computeNext` must not have side effects (as it is retried), 
 * `commit` must return `null` only when the CAS fails against the 
 * expected snapshot, and `attempts` must be > 0 to avoid infinite loops.
 * Gotchas: If `getFresh` returns the same snapshot that failed, the loop 
 * will repeat until `attempts` are exhausted; callers must update the 
 * snapshot after each actual re-read.
 */
import { ErrResult, OkResult, type Result } from "@/utils/result";

export type AtomicTransitionParams<TUser, TSnapshot, TNext, TOut> = {
  attempts: number;
  getInitial: () => Promise<Result<TUser, Error>>;
  getFresh: (
    previousUser: TUser,
    previousSnapshot: TSnapshot,
  ) => Promise<Result<TUser, Error>>;
  getSnapshot: (user: TUser) => TSnapshot;
  computeNext: (
    snapshot: TSnapshot,
  ) => Promise<Result<TNext, Error>> | Result<TNext, Error>;
  commit: (
    expected: TSnapshot,
    next: TNext,
  ) => Promise<Result<TUser | null, Error>>;
  project: (updatedUser: TUser, next: TNext, expected: TSnapshot) => TOut;
  onExhausted: (
    lastUser: TUser,
    lastSnapshot: TSnapshot,
  ) => Result<TOut, Error>;
};

/**
 * Executes a transition with retries and compare-and-swap.
 *
 * Purpose: Minimize concurrency conflicts without locks; if the CAS
 * fails, the user is re-read and the snapshot is recalculated until
 * `attempts` are exhausted.
 * Key Parameters:
 * - `getInitial`: First read; must be consistent with `getSnapshot`.
 * - `computeNext`: Calculates the next state from an immutable snapshot; 
 *   do not mutate shared objects.
 * - `commit`: Conditionally persists; must return `null` only when the 
 *   expected snapshot no longer matches.
 * Returns: `OkResult` with the projected value or `ErrResult` with the 
 * error found in any phase.
 * Errors: Bubbles any read/write error; the caller decides if it's 
 * recoverable.
 * Invariants: The snapshot must exactly reflect the state used in commit 
 * for correct concurrency verification.
 * RISK: If `onExhausted` silently normalizes, concurrent increments could 
 * be lost; prefer failing explicitly if the use case requires it.
 */
export async function atomicTransition<TUser, TSnapshot, TNext, TOut>(
  params: AtomicTransitionParams<TUser, TSnapshot, TNext, TOut>,
): Promise<Result<TOut, Error>> {
  const initial = await params.getInitial();
  if (initial.isErr()) return ErrResult(initial.error);

  let user = initial.unwrap();
  let snapshot = params.getSnapshot(user);

  for (let attempt = 0; attempt < params.attempts; attempt += 1) {
    const nextRes = await params.computeNext(snapshot);
    if (nextRes.isErr()) return ErrResult(nextRes.error);
    const next = nextRes.unwrap();

    const committed = await params.commit(snapshot, next);
    if (committed.isErr()) return ErrResult(committed.error);

    const updatedUser = committed.unwrap();
    if (updatedUser) {
      return OkResult(params.project(updatedUser, next, snapshot));
    }

    // WHY: commit returned null => another writer won the race; we re-read before
    // recomputing to avoid calculating on stale data.
    const fresh = await params.getFresh(user, snapshot);
    if (fresh.isErr()) return ErrResult(fresh.error);

    user = fresh.unwrap();
    snapshot = params.getSnapshot(user);
  }

  // RISK: Reaching here implies persistent conflicts; `onExhausted` decides 
  // whether to normalize (e.g. return last snapshot) or fail so the caller 
  // can take action (alert/telemetry/external retries).
  return params.onExhausted(user, snapshot);
}
