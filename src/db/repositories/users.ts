/**
 * Repositorio de usuarios.
 *
 * Responsabilidad:
 * - Encapsular el acceso a la colección `users` (MongoDB).
 * - Validar/normalizar documentos con `UserSchema` (Zod) en cada lectura/escritura.
 * - Centralizar el manejo de timestamps (`createdAt` / `updatedAt`).
 *
 * @remarks
 * Este repositorio expone una API “segura”: en lugar de lanzar excepciones, la mayoría de
 * operaciones retornan `Result<T>` para que el caller pueda decidir cómo manejar errores
 * (retry, fallback, logs, etc.).
 */

import { UserSchema, type User } from "@/db/schemas/user";
import { MongoStore } from "../mongo-store";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { UserId } from "@/db/types";
import { atomicTransition } from "@/db/atomic-transition";
import type { CurrencyInventory } from "@/modules/economy/currency";

/**
 * User Store instance.
 */
export const UserStore = new MongoStore<User>("users", UserSchema);



/* ------------------------------------------------------------------------- */
/* Reputación                                                               */
/* ------------------------------------------------------------------------- */

type ReputationSnapshot = {
  currency: CurrencyInventory;
  rep: number;
  hasRepCurrency: boolean;
};

const normalizeRep = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
};

const readRepFromCurrency = (currency?: CurrencyInventory): number =>
  normalizeRep((currency as any)?.rep);

const getReputationSnapshot = (user: User): ReputationSnapshot => {
  const currency = (user.currency ?? {}) as CurrencyInventory;
  const hasRepCurrency = Object.prototype.hasOwnProperty.call(currency, "rep");
  const rep = hasRepCurrency ? readRepFromCurrency(currency) : normalizeRep(user.rep ?? 0);
  return { currency, rep, hasRepCurrency };
};

export async function getUserReputation(id: UserId): Promise<Result<number>> {
  const user = await UserStore.ensure(id);
  if (user.isErr()) return ErrResult(user.error);

  const snapshot = getReputationSnapshot(user.unwrap());
  if (!snapshot.hasRepCurrency && snapshot.rep > 0) {
    const nextCurrency = { ...snapshot.currency, rep: snapshot.rep };
    await UserStore.replaceIfMatch(id, { currency: snapshot.currency } as any, {
      currency: nextCurrency,
    } as any);
  }

  return OkResult(snapshot.rep);
}

export async function updateUserReputation(
  id: UserId,
  updater: (current: number) => number,
): Promise<Result<number>> {
  return atomicTransition({
    attempts: 5,
    getInitial: () => UserStore.ensure(id),
    getFresh: (previousUser) => UserStore.get(id).then((res) => {
      if (res.isErr()) return ErrResult(res.error);
      const fresh = res.unwrap();
      return OkResult(fresh ?? previousUser);
    }),
    getSnapshot: (user) => getReputationSnapshot(user),
    computeNext: (snapshot) => {
      const nextRep = normalizeRep(updater(snapshot.rep));
      const nextCurrency = { ...snapshot.currency, rep: nextRep };
      return OkResult({ rep: nextRep, currency: nextCurrency });
    },
    commit: (expected, next) =>
      UserStore.replaceIfMatch(
        id,
        { currency: expected.currency } as any,
        { currency: next.currency } as any,
      ),
    project: (_updatedUser, next) => next.rep,
    onExhausted: (_lastUser, lastSnapshot) => OkResult(lastSnapshot.rep),
  });
}

export const setUserReputation = (id: UserId, val: number) =>
  updateUserReputation(id, () => val);
export const adjustUserReputation = (id: UserId, delta: number) =>
  updateUserReputation(id, (current) => current + delta);

/* ------------------------------------------------------------------------- */
/* Warns                                                                    */
/* ------------------------------------------------------------------------- */

// Warns are still here as they are simple array operations, 
// but we could move them to a ModerationRepo later.
export async function addWarn(id: UserId, warn: any): Promise<Result<any[]>> {
  const res = await UserStore.updatePaths(id, {
    warns: { $push: warn } as any
  });
  if (res.isErr()) return res.map(() => []);
  const fresh = await UserStore.get(id);
  return OkResult(fresh.unwrap()?.warns ?? []);
}

export async function listWarns(id: UserId): Promise<Result<any[]>> {
  const res = await UserStore.ensure(id);
  return res.map(u => u.warns ?? []);
} export async function removeWarn(id: UserId, warnId: string): Promise<Result<any[]>> {
  const res = await UserStore.updatePaths(id, {}, {
    pipeline: [
      {
        $set: {
          warns: {
            $filter: {
              input: "$warns",
              as: "w",
              cond: { $ne: ["$$w.warn_id", warnId] },
            },
          },
        },
      },
    ] as any
  });
  if (res.isErr()) return res.map(() => []);
  const fresh = await UserStore.get(id);
  return OkResult(fresh.unwrap()?.warns ?? []);
}

export async function clearWarns(id: UserId): Promise<Result<boolean>> {
  const res = await UserStore.patch(id, { warns: [] } as any);
  return res.map(() => true);
}
