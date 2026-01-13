import { normalizeStringArray } from "@/db/normalizers";
import { type Guild, GuildSchema } from "@/db/schemas/guild";
import type { GuildId } from "@/db/types";
import { MongoStore } from "../mongo-store";

/**
 * Repositorio de guilds: acceso validado + helpers de rutas para canales/tickets.
 *
 * Encaje: capa base para módulos de configuración, canales y tickets. Delegamos
 * validación a `MongoStore` (Zod) y exponemos helpers que manipulan sub-rutas
 * sin reconstruir el documento completo.
 */
export const GuildStore = new MongoStore<Guild>("guilds", GuildSchema);

/**
 * Aplica parches puntuales en rutas (`dot-notation`) o pipelines defensivos.
 *
 * Propósito: actualizar subdocumentos sin sobreescribir todo el guild.
 * Invariantes: asegura objetos vacíos en campos críticos antes de aplicar
 * `paths`, evita `null`/tipos incorrectos en `channels|features|ai|roles`.
 * Gotchas: si se pasa `pipeline`, NO se actualiza `updatedAt` automáticamente;
 * el pipeline debe manejarlo. Usa `$$REMOVE` para unsets cuando se provee.
 */
export async function updateGuildPaths(
  id: GuildId,
  paths: Record<string, unknown>,
  options: { unset?: string[] } = {},
): Promise<void> {
  const now = new Date();
  const removals: Record<string, unknown> = {};
  for (const path of options.unset ?? []) {
    if (path) removals[path] = "$$REMOVE";
  }

  const pipeline = [
    {
      $set: {
        createdAt: { $ifNull: ["$createdAt", now] },
        channels: {
          $cond: [{ $eq: [{ $type: "$channels" }, "object"] }, "$channels", {}],
        },
        features: {
          $cond: [{ $eq: [{ $type: "$features" }, "object"] }, "$features", {}],
        },
        reputation: {
          $cond: [
            { $eq: [{ $type: "$reputation" }, "object"] },
            "$reputation",
            {},
          ],
        },
        forumAutoReply: {
          $cond: [
            { $eq: [{ $type: "$forumAutoReply" }, "object"] },
            "$forumAutoReply",
            {},
          ],
        },
        ai: { $cond: [{ $eq: [{ $type: "$ai" }, "object"] }, "$ai", {}] },
        roles: {
          $cond: [{ $eq: [{ $type: "$roles" }, "object"] }, "$roles", {}],
        },
      },
    },
    {
      $set: {
        ...paths,
        ...removals,
        updatedAt: now,
      },
    },
  ];

  await GuildStore.updatePaths(
    id,
    {},
    { upsert: true, pipeline: pipeline as any },
  );
}

/* ------------------------------------------------------------------------- */
/* Tickets                                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Devuelve la lista normalizada de tickets pendientes (strings únicos).
 * Side effects: asegura el documento de guild.
 */
export async function getPendingTickets(id: GuildId): Promise<string[]> {
  const g = await GuildStore.ensure(id);
  return normalizeStringArray(g.unwrap()?.pendingTickets);
}

/**
 * Aplica una función de transformación al array de pendientes y persiste.
 * Garantiza unicidad y tipo string; devuelve el nuevo valor normalizado.
 */
export async function setPendingTickets(
  id: GuildId,
  update: (tickets: string[]) => string[],
): Promise<string[]> {
  const current = await getPendingTickets(id);
  const next = Array.from(
    new Set(update(current).filter((s) => typeof s === "string")),
  );
  const res = await GuildStore.patch(id, { pendingTickets: next } as any);
  return normalizeStringArray(res.unwrap()?.pendingTickets);
}
