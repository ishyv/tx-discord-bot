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

import {
  SanctionType,
  SanctionHistoryEntrySchema,
  UserSchema,
  WarnSchema,
  type User,
  type Warn,
} from "@/db/schemas/user";
import { MongoStore } from "../mongo-store";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { UserId } from "@/db/types";
import { atomicTransition } from "@/db/atomic-transition";
import type { CurrencyInventory } from "@/modules/economy/currency";
import type { ItemInventory } from "@/modules/inventory/inventory";
import { UserTicketsRepo } from "./user-tickets";

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
  const rep = hasRepCurrency
    ? readRepFromCurrency(currency)
    : normalizeRep(user.rep ?? 0);
  return { currency, rep, hasRepCurrency };
};

export async function getUserReputation(id: UserId): Promise<Result<number>> {
  const user = await UserStore.ensure(id);
  if (user.isErr()) return ErrResult(user.error);

  const snapshot = getReputationSnapshot(user.unwrap());
  if (!snapshot.hasRepCurrency && snapshot.rep > 0) {
    const nextCurrency = { ...snapshot.currency, rep: snapshot.rep };
    await UserStore.replaceIfMatch(
      id,
      { currency: snapshot.currency } as any,
      {
        currency: nextCurrency,
      } as any,
    );
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
    getFresh: (previousUser) =>
      UserStore.get(id).then((res) => {
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
export async function listWarns(id: UserId): Promise<Result<Warn[]>> {
  const res = await UserStore.ensure(id);
  if (res.isErr()) return ErrResult(res.error);
  return OkResult((res.unwrap().warns ?? []) as Warn[]);
}

export async function setWarns(
  id: UserId,
  warns: Warn[],
): Promise<Result<Warn[]>> {
  const parsed = WarnSchema.array().safeParse(warns);
  if (!parsed.success) {
    return ErrResult(parsed.error);
  }

  const res = await UserStore.patch(id, { warns: parsed.data } as any);
  if (res.isErr()) return ErrResult(res.error);
  return OkResult((res.unwrap().warns ?? []) as Warn[]);
}

export async function addWarn(id: UserId, warn: Warn): Promise<Result<Warn[]>> {
  const parsed = WarnSchema.safeParse(warn);
  if (!parsed.success) {
    return ErrResult(parsed.error);
  }

  const currentRes = await listWarns(id);
  if (currentRes.isErr()) return currentRes;

  return setWarns(id, currentRes.unwrap().concat([parsed.data]));
}

export async function removeWarn(
  id: UserId,
  warnId: string,
): Promise<Result<Warn[]>> {
  const currentRes = await listWarns(id);
  if (currentRes.isErr()) return currentRes;

  const next = currentRes.unwrap().filter((w) => w.warn_id !== warnId);
  return setWarns(id, next);
}

export async function clearWarns(id: UserId): Promise<Result<Warn[]>> {
  return setWarns(id, []);
}

/* ------------------------------------------------------------------------- */
/* Core CRUD + helpers used by db-tests                                       */
/* ------------------------------------------------------------------------- */

export function toUser(doc: unknown): User | null {
  const parsed = UserSchema.safeParse(doc);
  if (parsed.success) return parsed.data;
  console.error("[users] invalid user document", parsed.error);
  const fallback = UserSchema.safeParse({ _id: "unknown" });
  return fallback.success ? fallback.data : null;
}

export async function ensureUser(id: UserId): Promise<Result<User>> {
  return UserStore.ensure(id);
}

export async function findUser(id: UserId): Promise<Result<User | null>> {
  return UserStore.get(id);
}

export async function deleteUser(id: UserId): Promise<Result<boolean>> {
  return UserStore.delete(id);
}

const normalizeNonNegativeInt = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
};

export async function saveUser(
  id: UserId,
  patch: Partial<User>,
): Promise<Result<User>> {
  const safePatch: Partial<User> = { ...patch };

  if (Object.prototype.hasOwnProperty.call(safePatch, "rep")) {
    (safePatch as any).rep = normalizeNonNegativeInt((safePatch as any).rep);
  }

  return UserStore.patch(id, safePatch as any);
}

export async function registerCase(
  userId: UserId,
  guildId: string,
  type: string,
  description: string,
): Promise<Result<void>> {
  const typeParsed = SanctionType.safeParse(type);
  if (!typeParsed.success) {
    return ErrResult(typeParsed.error);
  }

  const entryParsed = SanctionHistoryEntrySchema.safeParse({
    type: typeParsed.data,
    description,
    date: new Date().toISOString(),
  });
  if (!entryParsed.success) {
    return ErrResult(entryParsed.error);
  }

  const ensured = await UserStore.ensure(userId);
  if (ensured.isErr()) return ErrResult(ensured.error);

  const user = ensured.unwrap();
  const history = (user.sanction_history ?? {}) as Record<string, any[]>;
  const next = {
    ...history,
    [guildId]: (history[guildId] ?? []).concat([entryParsed.data]),
  };

  const res = await UserStore.patch(userId, { sanction_history: next } as any);
  if (res.isErr()) return ErrResult(res.error);
  return OkResult(undefined);
}

/* ------------------------------------------------------------------------- */
/* Open tickets                                                              */
/* ------------------------------------------------------------------------- */

export async function listOpenTickets(id: UserId): Promise<Result<string[]>> {
  const res = await UserStore.ensure(id);
  if (res.isErr()) return ErrResult(res.error);
  return OkResult(res.unwrap().openTickets ?? []);
}

export async function setOpenTickets(
  id: UserId,
  tickets: string[],
): Promise<Result<string[]>> {
  const next = Array.from(
    new Set((tickets ?? []).filter((t) => typeof t === "string")),
  );
  const res = await UserStore.patch(id, { openTickets: next } as any);
  if (res.isErr()) return ErrResult(res.error);
  return OkResult(res.unwrap().openTickets ?? []);
}

export async function addOpenTicket(
  id: UserId,
  channelId: string,
): Promise<Result<string[]>> {
  const current = await listOpenTickets(id);
  if (current.isErr()) return current;
  return setOpenTickets(id, current.unwrap().concat([channelId]));
}

export async function removeOpenTicket(
  id: UserId,
  channelId: string,
): Promise<Result<string[]>> {
  const current = await listOpenTickets(id);
  if (current.isErr()) return current;
  return setOpenTickets(
    id,
    current.unwrap().filter((c) => c !== channelId),
  );
}

export async function addOpenTicketIfBelowLimit(
  id: UserId,
  channelId: string,
  maxPerUser: number,
): Promise<Result<boolean>> {
  if (!channelId || maxPerUser <= 0) return OkResult(false);

  const current = await listOpenTickets(id);
  if (current.isErr()) return ErrResult(current.error);
  const list = current.unwrap();
  if (list.includes(channelId)) return OkResult(true);
  if (list.length >= Math.trunc(maxPerUser)) return OkResult(false);

  const updated = await addOpenTicket(id, channelId);
  if (updated.isErr()) return ErrResult(updated.error);
  return OkResult(true);
}

export async function removeOpenTicketByChannel(
  channelId: string,
): Promise<Result<void>> {
  const res = await UserTicketsRepo.removeByChannel(channelId);
  if (res.isErr()) return ErrResult(res.error);
  return OkResult(undefined);
}

/* ------------------------------------------------------------------------- */
/* CAS helpers for inventory/currency                                        */
/* ------------------------------------------------------------------------- */

export async function replaceInventoryIfMatch(
  id: UserId,
  expected: ItemInventory,
  next: ItemInventory,
): Promise<Result<User | null>> {
  return UserStore.replaceIfMatch(
    id,
    { inventory: expected } as any,
    {
      inventory: next,
    } as any,
  );
}

export async function replaceCurrencyIfMatch(
  id: UserId,
  expected: CurrencyInventory,
  next: CurrencyInventory,
): Promise<Result<User | null>> {
  return UserStore.replaceIfMatch(
    id,
    { currency: expected } as any,
    {
      currency: next,
    } as any,
  );
}

/**
 * Atomically increment a numeric currency value using $inc.
 * This is the preferred method for simple numeric adjustments (mod-only operations).
 * For complex currency types (like coins with hand/bank), use currencyTransaction.
 *
 * @param id User ID
 * @param currencyId Currency field path (e.g., "rep" or "coins.hand")
 * @param delta Amount to increment (can be negative)
 * @returns Updated user or error
 */
export async function incrementCurrency(
  id: UserId,
  currencyId: string,
  delta: number,
): Promise<Result<User | null>> {
  const fieldPath = `currency.${currencyId}`;

  try {
    const col = await UserStore.collection();
    const now = new Date();

    const result = await col.findOneAndUpdate(
      { _id: id } as any,
      {
        $inc: { [fieldPath]: delta } as any,
        $set: { updatedAt: now } as any,
      },
      { returnDocument: "after", upsert: false },
    );

    const doc = result as User | null;
    if (!doc) {
      return OkResult(null);
    }

    // Note: We bypass UserStore.parse here since we're doing a direct collection operation
    // The document should already conform to UserSchema since it came from the DB
    return OkResult(doc as import("@/db/schemas/user").User);
  } catch (error) {
    return ErrResult(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Atomically increment reputation (specialized helper).
 * Maintains backward compatibility with existing rep system.
 */
export async function incrementReputation(
  id: UserId,
  delta: number,
): Promise<Result<number, Error>> {
  const result = await incrementCurrency(id, "rep", delta);
  if (result.isErr()) {
    return ErrResult(result.error);
  }

  const user = result.unwrap();
  if (!user) {
    return ErrResult(new Error("User not found"));
  }

  const rep = (user.currency as Record<string, unknown>)?.rep;
  const normalizedRep =
    typeof rep === "number" ? Math.max(0, Math.trunc(rep)) : 0;
  return OkResult(normalizedRep);
}
