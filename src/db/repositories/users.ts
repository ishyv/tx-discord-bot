/**
 * User repository using native Mongo driver and Zod validation.
 * Purpose: expose user persistence operations with validated reads/writes and small domain helpers.
 */
import { getDb } from "@/db/mongo";
import { UserSchema, type User, type Warn } from "@/db/schemas/user";
import type { UserId, WarnId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";

const usersCollection = async () => (await getDb()).collection<User>("users");

const defaultUser = (id: UserId): User =>
  UserSchema.parse({
    _id: id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const mapError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const withDb = async <T>(op: () => Promise<T>): Promise<Result<T>> => {
  try {
    return OkResult(await op());
  } catch (error) {
    return ErrResult(mapError(error));
  }
};

const parseUser = (doc: unknown): User => UserSchema.parse(doc);

const loadUser = async (id: UserId): Promise<User | null> => {
  const col = await usersCollection();
  const doc = await col.findOne({ _id: id });
  return doc ? parseUser(doc) : null;
};

const saveUserDocument = async (user: User): Promise<User> => {
  const col = await usersCollection();
  const now = new Date();
  const next = parseUser({
    ...user,
    _id: user._id,
    updatedAt: now,
    createdAt: user.createdAt ?? now,
  });
  await col.replaceOne({ _id: next._id }, next, { upsert: true });
  return next;
};

const mutateUser = async (
  id: UserId,
  mutator: (current: User) => User,
): Promise<User> => {
  const current = (await loadUser(id)) ?? defaultUser(id);
  return saveUserDocument(mutator(current));
};

/* ------------------------------------------------------------------------- */
/* Core CRUD                                                                 */
/* ------------------------------------------------------------------------- */

/** Lee un usuario por id, devolviendo un POJO o null. */
export async function findUser(id: UserId): Promise<Result<User | null>> {
  return withDb(async () => loadUser(id));
}

/** Crea o actualiza un usuario aplicando un patch. */
export async function saveUser(
  id: UserId,
  patch: Partial<User>,
): Promise<Result<User>> {
  return withDb(async () =>
    mutateUser(id, (current) => parseUser({ ...current, ...patch, _id: id })),
  );
}

/** Elimina un usuario; retorna true si se borró algo. */
export async function deleteUser(id: UserId): Promise<Result<boolean>> {
  return withDb(async () => {
    const col = await usersCollection();
    const res = await col.deleteOne({ _id: id });
    return (res.deletedCount ?? 0) > 0;
  });
}

/** Obtiene un usuario o lo crea con defaults. */
export async function ensureUser(id: UserId): Promise<Result<User>> {
  return withDb(async () => {
    const existing = await loadUser(id);
    if (existing) return existing;
    const next = defaultUser(id);
    await saveUserDocument(next);
    return next;
  });
}

/* ------------------------------------------------------------------------- */
/* Reputación                                                               */
/* ------------------------------------------------------------------------- */

const clampRep = (value: number): number => Math.max(0, Math.trunc(value));

export async function getUserReputation(id: UserId): Promise<Result<number>> {
  const user = await ensureUser(id);
  if (user.isErr()) return ErrResult(user.error);
  return OkResult(clampRep(user.unwrap().rep ?? 0));
}

export async function updateUserReputation(
  id: UserId,
  updater: (current: number) => number,
): Promise<Result<number>> {
  return withDb(async () => {
    const updated = await mutateUser(id, (u) => {
      const next = clampRep(updater(clampRep(u.rep ?? 0)));
      return { ...u, rep: next };
    });
    return clampRep(updated.rep ?? 0);
  });
}

export const setUserReputation = (id: UserId, val: number) =>
  updateUserReputation(id, () => val);
export const adjustUserReputation = (id: UserId, delta: number) =>
  updateUserReputation(id, (current) => current + delta);

/* ------------------------------------------------------------------------- */
/* Warns                                                                    */
/* ------------------------------------------------------------------------- */

export async function addWarn(id: UserId, warn: Warn): Promise<Result<Warn[]>> {
  return withDb(async () => {
    const updated = await mutateUser(id, (u) => ({
      ...u,
      warns: [...(u.warns ?? []), warn],
    }));
    return updated.warns ?? [];
  });
}

export async function listWarns(id: UserId): Promise<Result<Warn[]>> {
  const user = await ensureUser(id);
  if (user.isErr()) return ErrResult(user.error);
  return OkResult(user.unwrap().warns ?? []);
}

export async function setWarns(id: UserId, warns: Warn[]): Promise<Result<Warn[]>> {
  return withDb(async () => {
    const updated = await mutateUser(id, (u) => ({ ...u, warns: [...warns] }));
    return updated.warns ?? [];
  });
}

export async function removeWarn(id: UserId, warnId: WarnId): Promise<Result<Warn[]>> {
  return withDb(async () => {
    const updated = await mutateUser(id, (u) => ({
      ...u,
      warns: (u.warns ?? []).filter((w) => w.warn_id !== warnId),
    }));
    return updated.warns ?? [];
  });
}

export async function clearWarns(id: UserId): Promise<Result<Warn[]>> {
  return setWarns(id, []);
}

/* ------------------------------------------------------------------------- */
/* Tickets abiertos                                                         */
/* ------------------------------------------------------------------------- */

const sanitizeTickets = (list: string[]) =>
  Array.from(new Set(list.filter((s) => typeof s === "string")));

export async function listOpenTickets(id: UserId): Promise<Result<string[]>> {
  const user = await ensureUser(id);
  if (user.isErr()) return ErrResult(user.error);
  return OkResult(user.unwrap().openTickets ?? []);
}

export async function setOpenTickets(id: UserId, tickets: string[]): Promise<Result<string[]>> {
  return withDb(async () => {
    const updated = await mutateUser(id, (u) => ({
      ...u,
      openTickets: sanitizeTickets(tickets),
    }));
    return updated.openTickets ?? [];
  });
}

export async function addOpenTicket(id: UserId, channelId: string): Promise<Result<string[]>> {
  return withDb(async () => {
    const updated = await mutateUser(id, (u) => {
      const next = new Set(u.openTickets ?? []);
      next.add(channelId);
      return { ...u, openTickets: Array.from(next) };
    });
    return updated.openTickets ?? [];
  });
}

export async function removeOpenTicket(
  id: UserId,
  channelId: string,
): Promise<Result<string[]>> {
  return withDb(async () => {
    const updated = await mutateUser(id, (u) => ({
      ...u,
      openTickets: (u.openTickets ?? []).filter((t) => t !== channelId),
    }));
    return updated.openTickets ?? [];
  });
}

export async function removeOpenTicketByChannel(channelId: string): Promise<Result<void>> {
  if (!channelId) return OkResult(undefined);
  return withDb(async () => {
    const col = await usersCollection();
    await col.updateMany({ openTickets: channelId }, { $pull: { openTickets: channelId } });
  });
}

/* ------------------------------------------------------------------------- */
/* CAS helpers for inventory/currency                                       */
/* ------------------------------------------------------------------------- */

export async function replaceInventoryIfMatch(
  id: UserId,
  expected: Record<string, unknown>,
  next: Record<string, unknown>,
): Promise<Result<User | null>> {
  return withDb(async () => {
    const col = await usersCollection();
    const now = new Date();
    const res = await col.findOneAndUpdate(
      { _id: id, inventory: expected },
      { $set: { inventory: next, updatedAt: now } },
      { returnDocument: "after" },
    );
    const value = res ?? (await col.findOne<User>({ _id: id }));
    return value ? parseUser(value) : null;
  });
}

export async function replaceCurrencyIfMatch(
  id: UserId,
  expected: Record<string, unknown>,
  next: Record<string, unknown>,
): Promise<Result<User | null>> {
  return withDb(async () => {
    const col = await usersCollection();
    const now = new Date();
    const res = await col.findOneAndUpdate(
      { _id: id, currency: expected },
      { $set: { currency: next, updatedAt: now } },
      { returnDocument: "after" },
    );
    const value = res ?? (await col.findOne<User>({ _id: id }));
    return value ? parseUser(value) : null;
  });
}

// Export parser for compatibility with callers expecting toUser.
export const toUser = (doc: unknown): User | null => {
  try {
    return parseUser(doc);
  } catch {
    return null;
  }
};
