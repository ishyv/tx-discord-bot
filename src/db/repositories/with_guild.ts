/**
 * Helpers de compatibilidad (API legacy) para trabajar con documentos `Guild`.
 *
 * Este archivo mantiene firmas históricas (`withGuild`, `getGuild`, `ensureGuild`) pero
 * delega la persistencia real al repositorio moderno de guilds.
 *
 * @remarks
 * `withGuild` implementa un patrón read → clone → mutate → save. Es cómodo para código
 * antiguo que “mutaba” el documento en memoria, pero no es atómico: en escenarios
 * concurrentes puede ocurrir “last write wins”. Para cambios acotados preferí las
 * funciones especializadas de `src/db/repositories/guilds.ts`.
 */
import type { Guild } from "@/db/schemas/guild";
import type { GuildId } from "@/db/types";
import { deepClone } from "@/db/helpers";
import { ensureGuild as ensureGuildRepo, updateGuild as updateGuildRepo, getGuild as getGuildRepo } from "@/db/repositories/guilds";

/**
 * Ejecuta una mutación sobre una copia del documento de guild y persiste el resultado.
 *
 * @typeParam T Valor retornado por el callback del caller.
 * @param id Id del servidor (guild).
 * @param callback Función que recibe una copia del documento y puede mutarlo.
 * @returns El valor retornado por `callback`.
 *
 * @remarks
 * - Persiste el documento completo al final (replace vía `updateGuild`).
 * - Sella `updatedAt` automáticamente.
 * - No hace control de concurrencia: si dos `withGuild` corren a la vez, el último en
 *   escribir puede pisar cambios del otro.
 */
export async function withGuild<T>(
  id: GuildId,
  callback: (guild: Guild) => Promise<T> | T,
): Promise<T> {
  const current = await ensureGuildRepo(id);
  const working: Guild = deepClone(current);
  const result = await callback(working);
  await updateGuildRepo(id, { ...working, updatedAt: new Date() });
  return result;
}

/**
 * Wrapper legacy sobre `getGuild` del repositorio.
 *
 * @param id Id del servidor (se mantiene como `string` por compatibilidad).
 * @returns El documento normalizado o `null` si no existe.
 */
export async function getGuild(id: string): Promise<Guild | null> {
  return getGuildRepo(id);
}

/**
 * Wrapper legacy sobre `ensureGuild` del repositorio.
 *
 * @param id Id del servidor (se mantiene como `string` por compatibilidad).
 * @returns El documento existente o uno nuevo con defaults persistidos.
 */
export async function ensureGuild(id: string): Promise<Guild> {
  return ensureGuildRepo(id);
}
