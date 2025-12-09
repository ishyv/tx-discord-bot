/**
 * Author: Repositories team
 * Purpose: Coordinates Mongo repo operations with the in-memory autorole cache so callers get a single place to refresh, mutate, and mirror state.
 * Why exists: Separates cache bookkeeping from raw persistence and business logic, keeping cache updates consistent whenever rules or tallies change.
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

export async function refreshGuildRules(
  guildId: string,
): Promise<AutoRoleRule[]> {
  const rules = await AutoRoleRulesRepo.fetchByGuild(guildId);
  const enabledOnly = rules.filter((rule) => rule.enabled);
  setGuildRules(guildId, enabledOnly);
  return rules;
}

export async function createRule(
  input: CreateAutoRoleRuleInput,
): Promise<AutoRoleRule> {
  const rule = await AutoRoleRulesRepo.insert(input);
  await refreshGuildRules(rule.guildId);
  return rule;
}

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

export async function incrementReactionTally(
  key: ReactionTallyKey,
  authorId: string,
): Promise<ReactionTallySnapshot> {
  const snapshot = await AutoRoleTalliesRepo.increment(key, authorId);
  setTally(snapshot);
  return snapshot;
}

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

export async function removeReactionTally(
  key: ReactionTallyKey,
): Promise<void> {
  const deleted = await AutoRoleTalliesRepo.deleteOne(key);
  if (deleted) {
    deleteTally(key);
  }
}

export async function drainMessageState(
  guildId: string,
  messageId: string,
): Promise<{
    presence: ReactionPresenceKey[];
    tallies: ReactionTallySnapshot[];
  }> {
  const presence = clearPresenceForMessage(guildId, messageId);
  const tallies = await AutoRoleTalliesRepo.listForMessage(guildId, messageId);
  deleteTalliesForMessage(guildId, messageId);
  if (tallies.length > 0) {
    await AutoRoleTalliesRepo.deleteForMessage(guildId, messageId);
  }
  return { presence, tallies };
}

export function trackPresence(key: ReactionPresenceKey): void {
  markPresence(key);
}

export function clearTrackedPresence(key: ReactionPresenceKey): void {
  clearPresence(key);
}
