/**
 * Coordinador repo ↔ cache para Autorole.
 *
 * Responsabilidad:
 * - Ejecutar operaciones de persistencia (repos) y reflejar cambios en el cache en memoria.
 * - Proveer una única superficie para “mutar y mantener consistente” (evita olvidarse de actualizar cache).
 *
 * @remarks
 * Este archivo no decide reglas de negocio (eso vive en `autorole.service.ts` y módulos).
 * Su foco es sincronización de estado: DB → cache y cache → DB cuando corresponde.
 */
import {
  clearPresence,
  clearPresenceForMessage,
  deleteTalliesForMessage,
  deleteTally,
  getTally,
  markPresence,
  removeRule as removeRuleFromCache,
  setGuildRules,
  setTally,
  upsertRule as upsertRuleInCache,
} from "@/modules/autorole/cache";
import type {
  AutoRoleRule,
  CreateAutoRoleRuleInput,
  ReactionPresenceKey,
  ReactionTallyKey,
  ReactionTallySnapshot,
} from "@/modules/autorole/types";
import { AutoRoleRulesRepo, AutoRoleTalliesRepo } from "./autorole.repo";

/**
 * Carga todas las reglas desde DB y llena el cache agrupado por guild.
 *
 * @remarks
 * Solo cachea reglas habilitadas (disabled se mantienen en DB pero no participan en triggers).
 */
export async function loadRulesIntoCache(): Promise<void> {
  const all = await AutoRoleRulesRepo.fetchAll();
  const byGuild = new Map<string, AutoRoleRule[]>();

  for (const rule of all) {
    const list = byGuild.get(rule.guildId) ?? [];
    list.push(rule);
    byGuild.set(rule.guildId, list);
  }

  for (const [guildId, rules] of byGuild.entries()) {
    const enabledOnly = rules.filter((rule) => rule.enabled);
    setGuildRules(guildId, enabledOnly);
  }
}

/**
 * Refresca reglas de un guild específico y actualiza el cache (solo habilitadas).
 *
 * @returns La lista completa desde DB (incluye habilitadas y deshabilitadas).
 */
export async function refreshGuildRules(
  guildId: string,
): Promise<AutoRoleRule[]> {
  const rules = await AutoRoleRulesRepo.fetchByGuild(guildId);
  const enabledOnly = rules.filter((rule) => rule.enabled);
  setGuildRules(guildId, enabledOnly);
  return rules;
}

/**
 * Crea una regla y luego refresca el cache del guild.
 */
export async function createRule(
  input: CreateAutoRoleRuleInput,
): Promise<AutoRoleRule> {
  const rule = await AutoRoleRulesRepo.insert(input);
  await refreshGuildRules(rule.guildId);
  return rule;
}

/**
 * Habilita una regla en DB y la inserta/actualiza en el cache.
 */
export async function enableRule(
  guildId: string,
  name: string,
): Promise<AutoRoleRule | null> {
  const rule = await AutoRoleRulesRepo.updateEnabled({
    guildId,
    name,
    enabled: true,
  });
  if (rule?.enabled) {
    upsertRuleInCache(rule);
  }
  return rule;
}

/**
 * Deshabilita una regla en DB y la remueve del cache.
 */
export async function disableRule(
  guildId: string,
  name: string,
): Promise<AutoRoleRule | null> {
  const rule = await AutoRoleRulesRepo.updateEnabled({
    guildId,
    name,
    enabled: false,
  });
  if (rule && !rule.enabled) {
    removeRuleFromCache(guildId, name);
  }
  return rule;
}

/**
 * Elimina una regla en DB (y sus grants asociados) y la remueve del cache.
 */
export async function deleteRule(
  guildId: string,
  name: string,
): Promise<boolean> {
  const deleted = await AutoRoleRulesRepo.delete({ guildId, name });
  if (deleted) {
    removeRuleFromCache(guildId, name);
  }
  return deleted;
}

/**
 * Incrementa (DB) y sincroniza (cache) un contador de reacción.
 */
export async function incrementReactionTally(
  key: ReactionTallyKey,
  authorId: string,
): Promise<ReactionTallySnapshot> {
  const snapshot = await AutoRoleTalliesRepo.increment(key, authorId);
  setTally(snapshot);
  return snapshot;
}

/**
 * Decrementa (DB) y sincroniza (cache) un contador de reacción.
 *
 * @returns Snapshot actualizado o `null` si no existía.
 */
export async function decrementReactionTally(
  key: ReactionTallyKey,
): Promise<ReactionTallySnapshot | null> {
  const snapshot = await AutoRoleTalliesRepo.decrement(key);
  if (!snapshot) return null;

  if (snapshot.count <= 0) {
    deleteTally(key);
  } else {
    setTally(snapshot);
  }

  return snapshot;
}

/**
 * Lee un contador de reacción desde cache; si no está, cae a DB y lo cachea.
 */
export async function readReactionTally(
  key: ReactionTallyKey,
): Promise<ReactionTallySnapshot | null> {
  const cached = getTally(key);
  if (cached) return cached;

  const snapshot = await AutoRoleTalliesRepo.read(key);
  if (snapshot) {
    setTally(snapshot);
  }
  return snapshot;
}

/**
 * Elimina un contador de reacción en DB y lo remueve del cache si existía.
 */
export async function removeReactionTally(
  key: ReactionTallyKey,
): Promise<void> {
  const deleted = await AutoRoleTalliesRepo.deleteOne(key);
  if (deleted) {
    deleteTally(key);
  }
}

/**
 * “Drena” estado asociado a un mensaje: presencia + tallies.
 *
 * @remarks
 * Se usa en flujos donde un mensaje deja de existir (borrado/expirado) y hay que limpiar:
 * - Presencia: solo memoria.
 * - Tallies: memoria y DB.
 */
export async function drainMessageState(
  guildId: string,
  messageId: string,
): Promise<{ presence: ReactionPresenceKey[]; tallies: ReactionTallySnapshot[] }> {
  const presence = clearPresenceForMessage(guildId, messageId);
  const tallies = await AutoRoleTalliesRepo.listForMessage(guildId, messageId);
  deleteTalliesForMessage(guildId, messageId);
  if (tallies.length > 0) {
    await AutoRoleTalliesRepo.deleteForMessage(guildId, messageId);
  }
  return { presence, tallies };
}

/**
 * Marca en cache que un usuario ya “pasó” por una presencia (para deduplicar eventos).
 */
export function trackPresence(key: ReactionPresenceKey): void {
  markPresence(key);
}

/**
 * Desmarca una presencia previamente registrada.
 */
export function clearTrackedPresence(key: ReactionPresenceKey): void {
  clearPresence(key);
}
