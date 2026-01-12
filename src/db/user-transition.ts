import { UserStore } from "@/db/repositories/users";
import { atomicTransition } from "./atomic-transition";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { User } from "@/db/schemas/user";

type UserTransitionOptions<TSnapshot, TNext, TOut> = {
    attempts?: number;
    getSnapshot: (user: User) => TSnapshot;
    computeNext: (snapshot: TSnapshot) => Promise<Result<TNext, Error>> | Result<TNext, Error>;
    commit: (userId: string, expected: TSnapshot, next: TNext) => Promise<Result<User | null, Error>>;
    project: (updatedUser: User) => TOut;
    conflictError: string;
};

/**
 * Wrapper especializado para transacciones de usuario con concurrencia optimista.
 * Encapsula la lógica repetitiva de getInitial/getFresh y manejo de ciclos.
 */
export async function runUserTransition<TSnapshot, TNext, TOut>(
    userId: string,
    opts: UserTransitionOptions<TSnapshot, TNext, TOut>
): Promise<Result<TOut, Error>> {
    return atomicTransition({
        attempts: opts.attempts ?? 3,
        getInitial: () => UserStore.ensure(userId),
        getFresh: (prev) =>
            UserStore.get(userId).then((r) =>
                r.isErr() ? ErrResult(r.error) : OkResult(r.unwrap() ?? prev)
            ),
        getSnapshot: opts.getSnapshot,
        computeNext: opts.computeNext,
        commit: (expected, next) => opts.commit(userId, expected, next),
        project: (updatedUser) => opts.project(updatedUser),
        onExhausted: () => ErrResult(new Error(opts.conflictError)),
    });
}
