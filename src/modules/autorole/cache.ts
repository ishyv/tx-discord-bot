/**
 * The autorole cache keeps a lightweight in-memory view of rule routing so we can
 * answer reaction events without hitting the database on every emoji.  It mirrors
 * the persistent state stored through the repo module and exposes mutators the
 * data layer can call whenever rules change.
 */

import type {
  AutoRoleRule,
  GuildRuleCache,
  ReactionPresenceKey,
  ReactionPresenceKeyString,
  ReactionTallyKey,
  ReactionTallyKeyString,
  ReactionTallySnapshot,
} from "./types";

const rulesByGuild = new Map<string, GuildRuleCache>();
const presenceKeys = new Set<ReactionPresenceKeyString>();
const tallySnapshots = new Map<ReactionTallyKeyString, ReactionTallySnapshot>();

function makePresenceKey(
  key: ReactionPresenceKey,
): ReactionPresenceKeyString {
  return `${key.guildId}:${key.messageId}:${key.emojiKey}:${key.userId}`;
}

function makeTallyKey(
  key: ReactionTallyKey,
): ReactionTallyKeyString {
  return `${key.guildId}:${key.messageId}:${key.emojiKey}`;
}

function ensureCache(guildId: string): GuildRuleCache {
  let cache = rulesByGuild.get(guildId);
  if (!cache) {
    cache = {
      anyReact: [],
      reactSpecific: new Map(),
      reactedByEmoji: new Map(),
      repThresholds: [],
    };
    rulesByGuild.set(guildId, cache);
  }
  return cache;
}

export function setGuildRules(
  guildId: string,
  rules: AutoRoleRule[],
): void {
  const cache: GuildRuleCache = {
    anyReact: [],
    reactSpecific: new Map(),
    reactedByEmoji: new Map(),
    repThresholds: [],
  };

  for (const rule of rules) {
    bucketRule(cache, rule);
  }

  rulesByGuild.set(guildId, cache);
}

export function upsertRule(rule: AutoRoleRule): void {
  const cache = ensureCache(rule.guildId);

  // Remove previous occurrences of the rule
  cache.anyReact = cache.anyReact.filter((r) => r.name !== rule.name);
  for (const [, list] of cache.reactSpecific) {
    filterInPlace(list, (r) => r.name !== rule.name);
  }
  for (const [, list] of cache.reactedByEmoji) {
    filterInPlace(list, (r) => r.name !== rule.name);
  }

  bucketRule(cache, rule);
}

export function removeRule(
  guildId: string,
  ruleName: string,
): void {
  const cache = rulesByGuild.get(guildId);
  if (!cache) return;

  cache.anyReact = cache.anyReact.filter((r) => r.name !== ruleName);
  for (const [key, list] of cache.reactSpecific.entries()) {
    const next = list.filter((r) => r.name !== ruleName);
    if (next.length === 0) {
      cache.reactSpecific.delete(key);
    } else {
      cache.reactSpecific.set(key, next);
    }
  }
  for (const [key, list] of cache.reactedByEmoji.entries()) {
    const next = list.filter((r) => r.name !== ruleName);
    if (next.length === 0) {
      cache.reactedByEmoji.delete(key);
    } else {
      cache.reactedByEmoji.set(key, next);
    }
  }
  cache.repThresholds = cache.repThresholds.filter((r) => r.name !== ruleName);
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
  }
}

function filterInPlace<T>(arr: T[], predicate: (value: T) => boolean) {
  let write = 0;
  for (const value of arr) {
    if (predicate(value)) {
      arr[write++] = value;
    }
  }
  arr.length = write;
}

export function markPresence(key: ReactionPresenceKey): void {
  // Presence guards against duplicate grants when multiple reaction events race.
  presenceKeys.add(makePresenceKey(key));
}

export function clearPresence(
  key: ReactionPresenceKey,
): void {
  // Reset the guard so repeated reactions can grant again when appropriate.
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
      if (emojiKey && userId) {
        removed.push({
          guildId,
          messageId,
          emojiKey,
          userId,
        });
      }
    }
  }
  return removed;
}

export function setTally(snapshot: ReactionTallySnapshot): void {
  tallySnapshots.set(makeTallyKey(snapshot.key), snapshot);
}

export function getTally(
  key: ReactionTallyKey,
): ReactionTallySnapshot | null {
  return tallySnapshots.get(makeTallyKey(key)) ?? null;
}

export function deleteTally(key: ReactionTallyKey): void {
  tallySnapshots.delete(makeTallyKey(key));
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
