/**
 * Repositorio de usuarios con una API mínima y legible.
 * Objetivos:
 * - Siempre devolver POJOs (lean) sin exponer objetos de Mongoose.
 * - Usar Result<T> en lugar de lanzar excepciones.
 * - Mantener solo operaciones sencillas: leer, guardar (upsert) y borrar,
 *   más algunos helpers de dominio (reputación, warns, tickets) construidos sobre ellas.
 */
import { connectMongo } from "@/db/client";
import { UserModel, type UserData, type Warn } from "@/db/models/user.schema";
import type { UserId, WarnId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";

const defaultUser = (id: UserId): UserData => ({
  _id: id,
  rep: 0,
  warns: [],
  openTickets: [],
  currency: {},
  inventory: {},
});

const mapError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

export const toUser = (doc: any): UserData | null => {
  if (!doc) return null;
  return {
    _id: doc._id,
    rep: Number(doc.rep ?? 0),
    warns: Array.isArray(doc.warns) ? doc.warns.map((w: Warn) => ({ ...w })) : [],
    openTickets: Array.isArray(doc.openTickets)
      ? doc.openTickets.filter((v: unknown): v is string => typeof v === "string")
      : [],
    currency: doc.currency ?? {},
    inventory: doc.inventory ?? {},
  };
};

const withDb = async <T>(op: () => Promise<T>): Promise<Result<T>> => {
  try {
    await connectMongo();
    return OkResult(await op());
  } catch (error) {
    return ErrResult(mapError(error));
  }
};

/* ------------------------------------------------------------------------- */
/* Core CRUD                                                                 */
/* ------------------------------------------------------------------------- */

/** Lee un usuario por id, devolviendo un POJO o null. */
export async function findUser(id: UserId): Promise<Result<UserData | null>> {
  return withDb(async () => {
    const doc = await UserModel.findById(id).lean();
    return toUser(doc);
  });
}

/** Crea o actualiza un usuario aplicando un patch. */
export async function saveUser(
  id: UserId,
  patch: Partial<UserData>,
): Promise<Result<UserData>> {
  return withDb(async () => {
    const doc = await UserModel.findByIdAndUpdate(
      id,
      { $set: patch, $setOnInsert: defaultUser(id) },
      { new: true, upsert: true, lean: true },
    );
    const mapped = toUser(doc);
    if (!mapped) throw new Error("FAILED_TO_SAVE_USER");
    return mapped;
  });
}

/** Elimina un usuario; retorna true si se borró algo. */
export async function deleteUser(id: UserId): Promise<Result<boolean>> {
  return withDb(async () => {
    const res = await UserModel.deleteOne({ _id: id }).lean();
    return (res as any)?.deletedCount > 0;
  });
}

/** Obtiene un usuario o lo crea con defaults. */
export async function ensureUser(id: UserId): Promise<Result<UserData>> {
  const existing = await findUser(id);
  if (existing.isErr()) return ErrResult(existing.error);
  const value = existing.unwrap();
  if (value) return OkResult(value);
  return saveUser(id, defaultUser(id));
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
    const current = await getUserReputation(id);
    if (current.isErr()) throw current.error;
    const next = clampRep(updater(current.unwrap()));
    const saved = await saveUser(id, { rep: next });
    if (saved.isErr()) throw saved.error;
    return clampRep(saved.unwrap().rep ?? next);
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
    await ensureUser(id);
    const doc = await UserModel.findByIdAndUpdate(
      id,
      { $push: { warns: warn } },
      { new: true, lean: true },
    );
    return (doc?.warns as Warn[]) ?? [];
  });
}

export async function listWarns(id: UserId): Promise<Result<Warn[]>> {
  const user = await ensureUser(id);
  if (user.isErr()) return ErrResult(user.error);
  return OkResult(user.unwrap().warns ?? []);
}

export async function setWarns(id: UserId, warns: Warn[]): Promise<Result<Warn[]>> {
  const saved = await saveUser(id, { warns });
  if (saved.isErr()) return ErrResult(saved.error);
  return OkResult(saved.unwrap().warns ?? []);
}

export async function removeWarn(id: UserId, warnId: WarnId): Promise<Result<Warn[]>> {
  return withDb(async () => {
    await ensureUser(id);
    const doc = await UserModel.findByIdAndUpdate(
      id,
      { $pull: { warns: { warn_id: warnId } } },
      { new: true, lean: true },
    );
    return (doc?.warns as Warn[]) ?? [];
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
  const saved = await saveUser(id, { openTickets: sanitizeTickets(tickets) });
  if (saved.isErr()) return ErrResult(saved.error);
  return OkResult(saved.unwrap().openTickets ?? []);
}

export async function addOpenTicket(id: UserId, channelId: string): Promise<Result<string[]>> {
  return withDb(async () => {
    await ensureUser(id);
    const doc = await UserModel.findByIdAndUpdate(
      id,
      { $addToSet: { openTickets: channelId } },
      { new: true, lean: true },
    );
    return (doc?.openTickets as string[]) ?? [];
  });
}

export async function removeOpenTicket(
  id: UserId,
  channelId: string,
): Promise<Result<string[]>> {
  return withDb(async () => {
    await ensureUser(id);
    const doc = await UserModel.findByIdAndUpdate(
      id,
      { $pull: { openTickets: channelId } },
      { new: true, lean: true },
    );
    return (doc?.openTickets as string[]) ?? [];
  });
}

export async function removeOpenTicketByChannel(channelId: string): Promise<Result<void>> {
  if (!channelId) return OkResult(undefined);
  return withDb(async () => {
    const owners = await UserModel.find({ openTickets: channelId }, { _id: 1 }).lean();
    const ids = owners.map((o: any) => o._id);
    if (ids.length === 0) return;
    await UserModel.updateMany({ _id: { $in: ids } }, { $pull: { openTickets: channelId } });
  });
}
