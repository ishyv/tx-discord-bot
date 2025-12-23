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

import type { Filter, UpdateFilter } from "mongodb";
import { getDb } from "@/db/mongo";
import {
  type User,
  UserSchema,
  type Warn,
  WarnSchema,
} from "@/db/schemas/user";
import type { UserId, WarnId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";

const usersCollection = async () => (await getDb()).collection<User>("users");

// Base para nuevos usuarios.
//
// @remarks
// Históricamente se usaba `UserSchema.parse(...)` para que los defaults del schema fueran la
// fuente de verdad.
//
// Sin embargo, `.parse()` puede lanzar (por ejemplo, si el schema evoluciona con un refinement
// inesperado). Dado que este repo se usa en hot-paths, aplicamos la política no-throw:
// - `safeParse` + log.
// - Fallback mínimo (timestamps + _id) en caso extremo.
const defaultUser = (id: UserId, now: Date = new Date()): User => {
  const base = {
    _id: id,
    createdAt: now,
    updatedAt: now,
  };
  const parsed = UserSchema.safeParse(base);
  if (parsed.success) return parsed.data;
  console.error("users: failed to build default user; using raw fallback", {
    id,
    error: parsed.error,
  });
  return base as unknown as User;
};

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
const parseUser = (doc: unknown): User => {
  const parsed = UserSchema.safeParse(doc);
  if (parsed.success) return parsed.data;
  // Documento corrupto/legacy: degradamos a defaults en vez de romper el proceso.
  // Esto mantiene invariantes del resto del bot (que asume shapes estables).
  const id = typeof (doc as any)?._id === "string" ? ((doc as any)._id as UserId) : ("unknown" as UserId);
  console.error("users: invalid user document; using defaults", { id, error: parsed.error });
  return defaultUser(id);
};

const loadUser = async (id: UserId): Promise<User | null> => {
  const col = await usersCollection();
  const doc = await col.findOne({ _id: id });
  return doc ? parseUser(doc) : null;
};

// Replace (con upsert) tras revalidación; asegura timestamps consistentes.
const ensureUserDocument = async (
  id: UserId,
  now: Date = new Date(),
): Promise<User> => {
  const col = await usersCollection();
  const res = await col.findOneAndUpdate(
    { _id: id },
    { $setOnInsert: defaultUser(id, now) },
    { upsert: true, returnDocument: "after" },
  );
  if (!res) {
    console.error("No se pudo asegurar el usuario.", { id });
    return defaultUser(id, now);
  }
  try {
    return parseUser(res);
  } catch (error) {
    console.error("users: failed to parse ensured user; using defaults", {
      id,
      error,
    });
    return defaultUser(id, now);
  }
};

const updateUserDocument = async (
  id: UserId,
  update: UpdateFilter<User>,
  now: Date = new Date(),
): Promise<User> => {
  const col = await usersCollection();

  const existingSet = (update.$set as Partial<User> | undefined) ?? {};
  const existingSetOnInsert =
    (update.$setOnInsert as Partial<User> | undefined) ?? {};

  const nextUpdate: UpdateFilter<User> = {
    ...update,
    $setOnInsert: {
      ...defaultUser(id, now),
      ...existingSetOnInsert,
    },
    $set: {
      ...existingSet,
      updatedAt: now,
    },
  };

  const res = await col.findOneAndUpdate({ _id: id }, nextUpdate, {
    upsert: true,
    returnDocument: "after",
  });
  if (!res) {
    console.error("No se pudo actualizar el usuario.", { id });
    return defaultUser(id, now);
  }
  try {
    return parseUser(res);
  } catch (error) {
    console.error("users: failed to parse updated user; using defaults", {
      id,
      error,
    });
    return defaultUser(id, now);
  }
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
  return withDb(async () => {
    const validated = UserSchema.partial().parse(patch);
    return updateUserDocument(id, { $set: validated });
  });
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
  return withDb(async () => ensureUserDocument(id));
}

/* ------------------------------------------------------------------------- */
/* Reputación                                                               */
/* ------------------------------------------------------------------------- */

// Forzamos reputación a enteros no-negativos para evitar fracciones o valores inválidos en DB.
const clampRep = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
};

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
    const col = await usersCollection();

    let snapshot = await ensureUserDocument(id);

    for (let attempt = 0; attempt < 5; attempt++) {
      const currentRep = clampRep(snapshot.rep ?? 0);
      const nextRep = clampRep(updater(currentRep));
      const now = new Date();

      const filter: Filter<User> = {
        _id: id,
        $expr: { $eq: [{ $ifNull: ["$rep", 0] }, currentRep] },
      };

      const res = await col.findOneAndUpdate(
        filter,
        { $set: { rep: nextRep, updatedAt: now } },
        { returnDocument: "after" },
      );

      if (res) {
        const parsed = parseUser(res);
        return clampRep(parsed.rep ?? 0);
      }

      snapshot = (await loadUser(id)) ?? (await ensureUserDocument(id));
    }

    return clampRep(snapshot.rep ?? 0);
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
    const parsedWarn = WarnSchema.parse(warn);
    const updated = await updateUserDocument(id, {
      $push: { warns: parsedWarn },
    });
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
export async function setWarns(
  id: UserId,
  warns: Warn[],
): Promise<Result<Warn[]>> {
  return withDb(async () => {
    const parsedWarns = WarnSchema.array().parse(warns);
    const updated = await updateUserDocument(id, {
      $set: { warns: parsedWarns },
    });
    return updated.warns ?? [];
  });
}

/**
 * Elimina un warn por `warn_id` y devuelve la lista resultante.
 */
export async function removeWarn(
  id: UserId,
  warnId: WarnId,
): Promise<Result<Warn[]>> {
  return withDb(async () => {
    const updated = await updateUserDocument(id, {
      $pull: { warns: { warn_id: warnId } },
    });
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
export async function setOpenTickets(
  id: UserId,
  tickets: string[],
): Promise<Result<string[]>> {
  return withDb(async () => {
    const updated = await updateUserDocument(id, {
      $set: { openTickets: sanitizeTickets(tickets) },
    });
    return updated.openTickets ?? [];
  });
}

/**
 * Agrega un id de canal a la lista de tickets abiertos (idempotente).
 */
export async function addOpenTicket(
  id: UserId,
  channelId: string,
): Promise<Result<string[]>> {
  return withDb(async () => {
    const updated = await updateUserDocument(id, {
      $addToSet: { openTickets: channelId },
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
    const updated = await updateUserDocument(id, {
      $pull: { openTickets: channelId },
    });
    return updated.openTickets ?? [];
  });
}

/**
 * Intenta agregar un ticket abierto respetando un l¡mite m ximo.
 *
 * @remarks
 * Operaci¢n at¢mica: si el usuario ya alcanz¢ el l¡mite y el canal a agregar no est  presente,
 * no se escribe nada y retorna `Ok(false)`.
 */
export async function addOpenTicketIfBelowLimit(
  id: UserId,
  channelId: string,
  maxPerUser: number,
): Promise<Result<boolean>> {
  return withDb(async () => {
    if (!channelId) return false;

    const max = Number.isFinite(maxPerUser) ? Math.trunc(maxPerUser) : 0;
    if (max <= 0) return false;

    await ensureUserDocument(id);

    const col = await usersCollection();
    const now = new Date();
    const filter: Filter<User> = {
      _id: id,
      $or: [
        { openTickets: channelId },
        {
          $expr: {
            $lt: [{ $size: { $ifNull: ["$openTickets", []] } }, max],
          },
        },
      ],
    };

    const res = await col.findOneAndUpdate(
      filter,
      { $addToSet: { openTickets: channelId }, $set: { updatedAt: now } },
      { returnDocument: "after" },
    );

    return Boolean(res);
  });
}

/**
 * Remueve un canal de la lista de tickets abiertos para todos los usuarios.
 *
 * @remarks
 * Útil cuando un canal de ticket se elimina y hay que limpiar referencias colgantes.
 */
export async function removeOpenTicketByChannel(
  channelId: string,
): Promise<Result<void>> {
  if (!channelId) return OkResult(undefined);
  return withDb(async () => {
    const col = await usersCollection();
    await col.updateMany(
      { openTickets: channelId },
      { $pull: { openTickets: channelId } },
    );
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
