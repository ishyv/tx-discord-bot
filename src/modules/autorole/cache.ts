/**
 * In-memory cache for Autorole rules, reaction tallies, and presence guards.
 */
import type {
  AutoRoleRule,
  GuildRuleCache,
  ReactionPresenceKey,
  ReactionPresenceKeyString,
  ReactionTallyKey,
  ReactionTallyKeyString,
  ReactionTallySnapshot,
} from "./domain/types";
import { AutoRoleRulesStore } from "./data/store";

const rulesByGuild = new Map<string, GuildRuleCache>();
const presenceKeys = new Set<ReactionPresenceKeyString>();
const tallySnapshots = new Map<ReactionTallyKeyString, ReactionTallySnapshot>();

function makePresenceKey(key: ReactionPresenceKey): ReactionPresenceKeyString {
  return `${key.guildId}:${key.messageId}:${key.emojiKey}:${key.userId}`;
}

function makeTallyKey(
  guildId: string,
  messageId: string,
  emojiKey: string,
): ReactionTallyKeyString {
  return `${guildId}:${messageId}:${emojiKey}`;
}

function ensureCache(guildId: string): GuildRuleCache {
  let cache = rulesByGuild.get(guildId);
  if (!cache) {
    cache = {
      anyReact: [],
      reactSpecific: new Map(),
      reactedByEmoji: new Map(),
      messageContains: [],
      repThresholds: [],
      antiquityThresholds: [],
    };
    rulesByGuild.set(guildId, cache);
  }
  return cache;
}

export function setGuildRules(guildId: string, rules: AutoRoleRule[]): void {
  const cache: GuildRuleCache = {
    anyReact: [],
    reactSpecific: new Map(),
    reactedByEmoji: new Map(),
    messageContains: [],
    repThresholds: [],
    antiquityThresholds: [],
  };

  for (const rule of rules) {
    bucketRule(cache, rule);
  }

  rulesByGuild.set(guildId, cache);
}

export function upsertRule(rule: AutoRoleRule): void {
  const cache = ensureCache(rule.guildId);

  // Remove previous occurrences
  cache.anyReact = cache.anyReact.filter((r) => r.name !== rule.name);
  for (const [, list] of cache.reactSpecific)
    filterInPlace(list, (r) => r.name !== rule.name);
  for (const [, list] of cache.reactedByEmoji)
    filterInPlace(list, (r) => r.name !== rule.name);
  cache.messageContains = cache.messageContains.filter(
    (r) => r.name !== rule.name,
  );
  cache.repThresholds = cache.repThresholds.filter((r) => r.name !== rule.name);
  cache.antiquityThresholds = cache.antiquityThresholds.filter(
    (r) => r.name !== rule.name,
  );

  bucketRule(cache, rule);
}

export function removeRule(guildId: string, ruleName: string): void {
  const cache = rulesByGuild.get(guildId);
  if (!cache) return;

  cache.anyReact = cache.anyReact.filter((r) => r.name !== ruleName);
  for (const [key, list] of cache.reactSpecific.entries()) {
    const next = list.filter((r) => r.name !== ruleName);
    if (next.length === 0) cache.reactSpecific.delete(key);
    else cache.reactSpecific.set(key, next);
  }
  for (const [key, list] of cache.reactedByEmoji.entries()) {
    const next = list.filter((r) => r.name !== ruleName);
    if (next.length === 0) cache.reactedByEmoji.delete(key);
    else cache.reactedByEmoji.set(key, next);
  }
  cache.messageContains = cache.messageContains.filter(
    (r) => r.name !== ruleName,
  );
  cache.repThresholds = cache.repThresholds.filter((r) => r.name !== ruleName);
  cache.antiquityThresholds = cache.antiquityThresholds.filter(
    (r) => r.name !== ruleName,
  );
}

export function getGuildRules(guildId: string): GuildRuleCache {
  return ensureCache(guildId);
}

function bucketRule(cache: GuildRuleCache, rule: AutoRoleRule) {
  if (!rule.enabled) return;
  switch (rule.trigger.type) {
    case "MESSAGE_REACT_ANY":
      cache.anyReact.push(rule);
      break;
    case "REACT_SPECIFIC": {
      const key = `${rule.trigger.args.messageId}:${rule.trigger.args.emojiKey}`;
      const list = cache.reactSpecific.get(key) ?? [];
      list.push(rule);
      cache.reactSpecific.set(key, list);
      break;
    }
    case "REACTED_THRESHOLD": {
      const key = rule.trigger.args.emojiKey;
      const list = cache.reactedByEmoji.get(key) ?? [];
      list.push(rule);
      cache.reactedByEmoji.set(key, list);
      break;
    }
    case "REPUTATION_THRESHOLD":
      cache.repThresholds.push(rule);
      cache.repThresholds.sort(
        (a, b) =>
          (a.trigger.type === "REPUTATION_THRESHOLD"
            ? a.trigger.args.minRep
            : 0) -
          (b.trigger.type === "REPUTATION_THRESHOLD"
            ? b.trigger.args.minRep
            : 0),
      );
      break;
    case "ANTIQUITY_THRESHOLD":
      cache.antiquityThresholds.push(rule);
      cache.antiquityThresholds.sort(
        (a, b) =>
          (a.trigger.type === "ANTIQUITY_THRESHOLD"
            ? a.trigger.args.durationMs
            : 0) -
          (b.trigger.type === "ANTIQUITY_THRESHOLD"
            ? b.trigger.args.durationMs
            : 0),
      );
      break;
    case "MESSAGE_CONTAINS":
      cache.messageContains.push(rule);
      break;
  }
}

function filterInPlace<T>(arr: T[], predicate: (value: T) => boolean) {
  let write = 0;
  for (const value of arr) if (predicate(value)) arr[write++] = value;
  arr.length = write;
}

export function markPresence(key: ReactionPresenceKey): void {
  presenceKeys.add(makePresenceKey(key));
}

export function clearPresence(key: ReactionPresenceKey): void {
  presenceKeys.delete(makePresenceKey(key));
}

export function clearPresenceForMessage(
  guildId: string,
  messageId: string,
): ReactionPresenceKey[] {
  const removed: ReactionPresenceKey[] = [];
  const prefix = `${guildId}:${messageId}:`;
  for (const value of Array.from(presenceKeys)) {
    if (value.startsWith(prefix)) {
      presenceKeys.delete(value);
      const [, , emojiKey, userId] = value.split(":");
      if (emojiKey && userId)
        removed.push({ guildId, messageId, emojiKey, userId });
    }
  }
  return removed;
}

export function setTally(snapshot: ReactionTallySnapshot): void {
  tallySnapshots.set(
    makeTallyKey(snapshot.guildId, snapshot.messageId, snapshot.emojiKey),
    snapshot,
  );
}

export function getTally(key: ReactionTallyKey): ReactionTallySnapshot | null {
  return (
    tallySnapshots.get(
      makeTallyKey(key.guildId, key.messageId, key.emojiKey),
    ) ?? null
  );
}

export function deleteTally(key: ReactionTallyKey): void {
  tallySnapshots.delete(makeTallyKey(key.guildId, key.messageId, key.emojiKey));
}

export function deleteTalliesForMessage(
  guildId: string,
  messageId: string,
): number {
  let removed = 0;
  const prefix = `${guildId}:${messageId}:`;
  for (const [storedKey] of Array.from(tallySnapshots)) {
    if (storedKey.startsWith(prefix)) {
      tallySnapshots.delete(storedKey);
      removed++;
    }
  }
  return removed;
}

/**
 * Cache Refresh logic.
 */

export async function loadRulesIntoCache(): Promise<void> {
  const allRes = await AutoRoleRulesStore.find({});
  if (allRes.isErr()) return;

  const byGuild = new Map<string, AutoRoleRule[]>();
  for (const rule of allRes.unwrap()) {
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
  const res = await AutoRoleRulesStore.find({ guildId });
  if (res.isErr()) return [];

  const rules = res.unwrap();
  const enabledOnly = rules.filter((rule) => rule.enabled);
  setGuildRules(guildId, enabledOnly);
  return rules;
}
