/**
 * Purpose: Provide a safe shortcut for optimistic transitions on
 * `User` documents without duplicating the read/rehydration wiring.
 * Context: Convenience layer on top of `atomicTransition` used by
 * domain repositories (economy, reputation, etc.).
 * Dependencies: `UserStore` (CAS by `_id`), `Result` utilities, and the base
 * transition helper.
 * Invariants: The snapshot must be derived solely from the loaded user; 
 * `commit` must use the same snapshot passed to `computeNext`; 
 * `conflictError` describes the retry exhaustion condition.
 * Gotchas: `project` only receives the updated user; if snapshot data 
 * is needed, it must be calculated beforehand (to avoid reading inconsistent 
 * fields after a partial CAS).
 */
import { UserStore } from "@/db/repositories/users";
import type { User } from "@/db/schemas/user";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { atomicTransition } from "./atomic-transition";

type UserTransitionOptions<TSnapshot, TNext, TOut> = {
  attempts?: number;
  getSnapshot: (user: User) => TSnapshot;
  computeNext: (
    snapshot: TSnapshot,
  ) => Promise<Result<TNext, Error>> | Result<TNext, Error>;
  commit: (
    userId: string,
    expected: TSnapshot,
    next: TNext,
  ) => Promise<Result<User | null, Error>>;
  project: (updatedUser: User, next: TNext) => TOut;
  conflictError: string;
};

/**
 * Executes a specific user CAS transition.
 *
 * Purpose: Encapsulate the recipe of re-read + snapshot + conditional commit
 * for the `users` collection without each feature having to handle 
 * concurrency failures explicitly.
 * Parameters:
 * - `userId`: Primary key used to read/write in `UserStore`.
 * - `getSnapshot`: Derives an immutable view of the user (e.g. balance, rep,
 *   flags) that will serve as the CAS base.
 * - `computeNext`: Calculates the next state from the snapshot; re-executed
 *   at each retry.
 * - `commit`: Applies the change if the snapshot matches; must return `null`
 *   when the CAS fails (another writer touched the document).
 * - `project`: Transforms the final user into the value consumed by the 
 *   caller (e.g. updated amount).
 * - `conflictError`: Message used when retries are exhausted.
 * Side effects: Mongo reads/writes; does not modify global caches.
 * Errors: Bubbles I/O errors; returns `ErrResult` if retries are exhausted.
 * Invariants: `attempts` defines a hard retry limit to avoid loops; 
 * snapshots must be comparable (do not include volatile timestamps).
 */
export async function runUserTransition<TSnapshot, TNext, TOut>(
  userId: string,
  opts: UserTransitionOptions<TSnapshot, TNext, TOut>,
): Promise<Result<TOut, Error>> {
  return atomicTransition({
    attempts: opts.attempts ?? 3,
    getInitial: () => UserStore.ensure(userId),
    getFresh: (prev) =>
      UserStore.get(userId).then((r) =>
        r.isErr() ? ErrResult(r.error) : OkResult(r.unwrap() ?? prev),
      ),
    getSnapshot: opts.getSnapshot,
    computeNext: opts.computeNext,
    commit: (expected, next) => opts.commit(userId, expected, next),
    project: (updatedUser, next) => opts.project(updatedUser, next),
    onExhausted: () => ErrResult(new Error(opts.conflictError)),
  });
}
