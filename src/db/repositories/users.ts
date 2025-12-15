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
import { getDb } from "@/db/mongo";
import { UserSchema, type User, type Warn } from "@/db/schemas/user";
import type { UserId, WarnId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";

const usersCollection = async () => (await getDb()).collection<User>("users");

// Base para nuevos usuarios; se parsea para que los defaults del schema sean la fuente de verdad.
const defaultUser = (id: UserId): User =>
  UserSchema.parse({
    _id: id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

// Normaliza errores desconocidos a instancias de Error para Result helpers.
const mapError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

// Wrapper pequeño para ejecutar una operación de DB y devolverla como `Result<T>`.
const withDb = async <T>(op: () => Promise<T>): Promise<Result<T>> => {
  try {
    return OkResult(await op());
  } catch (error) {
    return ErrResult(mapError(error));
  }
};

// Todo lo que sale del repo se valida por Zod (no exponemos “docs crudos” del driver).
const parseUser = (doc: unknown): User => UserSchema.parse(doc);

const loadUser = async (id: UserId): Promise<User | null> => {
  const col = await usersCollection();
  const doc = await col.findOne({ _id: id });
  return doc ? parseUser(doc) : null;
};

// Replace (con upsert) tras revalidación; asegura timestamps consistentes.
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

/**
 * Crea o actualiza un usuario aplicando un patch (merge sobre el documento actual).
 *
 * @param id Id del usuario.
 * @param patch Cambios parciales a aplicar.
 * @returns `Ok(user)` con el documento validado/persistido, o `Err(error)` si falla la operación.
 */
export async function saveUser(
  id: UserId,
  patch: Partial<User>,
): Promise<Result<User>> {
  return withDb(async () =>
    mutateUser(id, (current) => parseUser({ ...current, ...patch, _id: id })),
  );
}

/**
 * Elimina un usuario de la colección.
 *
 * @returns `Ok(true)` si se borró un documento, `Ok(false)` si no existía, o `Err(error)` si falla.
 */
export async function deleteUser(id: UserId): Promise<Result<boolean>> {
  return withDb(async () => {
    const col = await usersCollection();
    const res = await col.deleteOne({ _id: id });
    return (res.deletedCount ?? 0) > 0;
  });
}

/**
 * Obtiene un usuario o lo crea con defaults (y lo persiste) si no existe.
 *
 * @remarks
 * Útil para flujos donde el resto del código quiere asumir que el usuario existe.
 */
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

// Forzamos reputación a enteros no-negativos para evitar fracciones o valores inválidos en DB.
const clampRep = (value: number): number => Math.max(0, Math.trunc(value));

/**
 * Obtiene la reputación actual del usuario.
 *
 * @remarks
 * - Si el usuario no existe, lo crea (via `ensureUser`) y retorna `0`.
 * - La reputación se normaliza a entero no-negativo.
 */
export async function getUserReputation(id: UserId): Promise<Result<number>> {
  const user = await ensureUser(id);
  if (user.isErr()) return ErrResult(user.error);
  return OkResult(clampRep(user.unwrap().rep ?? 0));
}

/**
 * Actualiza la reputación aplicando una función `updater` sobre el valor actual.
 *
 * @param updater Función pura que recibe el valor actual y devuelve el próximo.
 * @returns La reputación resultante (normalizada).
 */
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

/** Set directo de reputación (alias de `updateUserReputation`). */
export const setUserReputation = (id: UserId, val: number) =>
  updateUserReputation(id, () => val);
/** Ajuste incremental de reputación (alias de `updateUserReputation`). */
export const adjustUserReputation = (id: UserId, delta: number) =>
  updateUserReputation(id, (current) => current + delta);

/* ------------------------------------------------------------------------- */
/* Warns                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Agrega un warn al usuario, preservando los warns existentes.
 */
export async function addWarn(id: UserId, warn: Warn): Promise<Result<Warn[]>> {
  return withDb(async () => {
    const updated = await mutateUser(id, (u) => ({
      ...u,
      warns: [...(u.warns ?? []), warn],
    }));
    return updated.warns ?? [];
  });
}

/**
 * Lista los warns del usuario (si no existe, lo crea con defaults).
 */
export async function listWarns(id: UserId): Promise<Result<Warn[]>> {
  const user = await ensureUser(id);
  if (user.isErr()) return ErrResult(user.error);
  return OkResult(user.unwrap().warns ?? []);
}

/**
 * Reemplaza la lista completa de warns.
 *
 * @remarks
 * Normalmente `warns` se trata como un array append-only, pero este helper permite
 * reescrituras (ej: migraciones o moderación).
 */
export async function setWarns(id: UserId, warns: Warn[]): Promise<Result<Warn[]>> {
  return withDb(async () => {
    const updated = await mutateUser(id, (u) => ({ ...u, warns: [...warns] }));
    return updated.warns ?? [];
  });
}

/**
 * Elimina un warn por `warn_id` y devuelve la lista resultante.
 */
export async function removeWarn(id: UserId, warnId: WarnId): Promise<Result<Warn[]>> {
  return withDb(async () => {
    const updated = await mutateUser(id, (u) => ({
      ...u,
      warns: (u.warns ?? []).filter((w) => w.warn_id !== warnId),
    }));
    return updated.warns ?? [];
  });
}

/** Borra todos los warns del usuario. */
export async function clearWarns(id: UserId): Promise<Result<Warn[]>> {
  return setWarns(id, []);
}

/* ------------------------------------------------------------------------- */
/* Tickets abiertos                                                         */
/* ------------------------------------------------------------------------- */

// Elimina valores inválidos y duplicados para mantener referencias limpias.
const sanitizeTickets = (list: string[]) =>
  Array.from(new Set(list.filter((s) => typeof s === "string")));

/**
 * Devuelve la lista de tickets abiertos (por id de canal).
 */
export async function listOpenTickets(id: UserId): Promise<Result<string[]>> {
  const user = await ensureUser(id);
  if (user.isErr()) return ErrResult(user.error);
  return OkResult(user.unwrap().openTickets ?? []);
}

/**
 * Reemplaza la lista de tickets abiertos.
 *
 * @remarks
 * Aplica deduplicación y filtra valores no-string.
 */
export async function setOpenTickets(id: UserId, tickets: string[]): Promise<Result<string[]>> {
  return withDb(async () => {
    const updated = await mutateUser(id, (u) => ({
      ...u,
      openTickets: sanitizeTickets(tickets),
    }));
    return updated.openTickets ?? [];
  });
}

/**
 * Agrega un id de canal a la lista de tickets abiertos (idempotente).
 */
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

/**
 * Remueve un id de canal de la lista de tickets abiertos (si existía).
 */
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

/**
 * Remueve un canal de la lista de tickets abiertos para todos los usuarios.
 *
 * @remarks
 * Útil cuando un canal de ticket se elimina y hay que limpiar referencias colgantes.
 */
export async function removeOpenTicketByChannel(channelId: string): Promise<Result<void>> {
  if (!channelId) return OkResult(undefined);
  return withDb(async () => {
    const col = await usersCollection();
    await col.updateMany({ openTickets: channelId }, { $pull: { openTickets: channelId } });
  });
}

/* ------------------------------------------------------------------------- */
/* Helpers CAS (inventario/moneda)                                          */
/* ------------------------------------------------------------------------- */

/**
 * Reemplaza `inventory` solo si el valor actual coincide exactamente con `expected`.
 *
 * @remarks
 * Esto implementa un Compare-And-Set (CAS) simple para transacciones optimistas:
 * - `Ok(User)` cuando se pudo escribir (match).
 * - `Ok(null)` cuando no hubo match (otro proceso actualizó antes y el caller debería reintentar).
 * - `Err(error)` para fallas de DB/validación.
 */
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
    return res ? parseUser(res) : null;
  });
}

/**
 * Reemplaza `currency` solo si el valor actual coincide exactamente con `expected`.
 *
 * @remarks
 * Mismo patrón CAS que `replaceInventoryIfMatch`.
 */
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
    return res ? parseUser(res) : null;
  });
}

/**
 * Parser tolerante para inputs desconocidos.
 *
 * @remarks
 * A diferencia del resto del repositorio, este helper no retorna `Result` porque se usa
 * como “adapter” en sitios legacy: retorna `null` si el documento no pasa validación.
 */
export const toUser = (doc: unknown): User | null => {
  try {
    return parseUser(doc);
  } catch {
    return null;
  }
};
