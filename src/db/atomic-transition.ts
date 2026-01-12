import { ErrResult, OkResult, Result } from "@/utils/result";

export type AtomicTransitionParams<TUser, TSnapshot, TNext, TOut> = {
  attempts: number;
  getInitial: () => Promise<Result<TUser, Error>>;
  getFresh: (previousUser: TUser, previousSnapshot: TSnapshot) => Promise<Result<TUser, Error>>;
  getSnapshot: (user: TUser) => TSnapshot;
  computeNext: (snapshot: TSnapshot) => Promise<Result<TNext, Error>> | Result<TNext, Error>;
  commit: (expected: TSnapshot, next: TNext) => Promise<Result<TUser | null, Error>>;
  project: (updatedUser: TUser, next: TNext, expected: TSnapshot) => TOut;
  onExhausted: (lastUser: TUser, lastSnapshot: TSnapshot) => Result<TOut, Error>;
};

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

    const fresh = await params.getFresh(user, snapshot);
    if (fresh.isErr()) return ErrResult(fresh.error);

    user = fresh.unwrap();
    snapshot = params.getSnapshot(user);
  }

  return params.onExhausted(user, snapshot);
}
