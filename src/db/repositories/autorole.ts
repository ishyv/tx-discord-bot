import { connectMongo } from "../client";
import {
  AutoRoleGrantModel,
  AutoRoleReactionTallyModel,
  AutoRoleRuleModel,
  type AutoRoleGrantDoc,
  type AutoRoleReactionTallyDoc,
  type AutoRoleRuleDoc,
} from "../models/autorole";
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
import { isLiveRule } from "@/modules/autorole/parsers";
import type {
  AutoRoleGrantReason,
  AutoRoleRule,
  CreateAutoRoleRuleInput,
  DeleteRuleInput,
  GrantByRuleInput,
  ReactionPresenceKey,
  ReactionTallyKey,
  ReactionTallySnapshot,
  RevokeByRuleInput,
  UpdateRuleEnabledInput,
} from "@/modules/autorole/types";
import type { UsingClient } from "seyfert";
import { enqueueRoleGrant, enqueueRoleRevoke } from "@/systems/autorole/roleOps";
import { format as formatMs } from "@/utils/ms";
import { ensureGuild } from "./guilds";

const ruleKey = (guildId: string, name: string) => `${guildId}:${name}`;
const grantKey = (
  guildId: string,
  userId: string,
  roleId: string,
  ruleName: string,
  type: string,
) => `${guildId}:${userId}:${roleId}:${ruleName}:${type}`;
const tallyKey = (guildId: string, messageId: string, emojiKey: string) =>
  `${guildId}:${messageId}:${emojiKey}`;

function toAutoRoleTrigger(row: AutoRoleRuleDoc): AutoRoleRule["trigger"] {
  const baseArgs = (row.args ?? {}) as Record<string, unknown>;
  switch (row.triggerType) {
    case "MESSAGE_REACT_ANY":
      return { type: "MESSAGE_REACT_ANY", args: {} };
    case "REACT_SPECIFIC":
      return {
        type: "REACT_SPECIFIC",
        args: {
          messageId: String(baseArgs.messageId ?? ""),
          emojiKey: String(baseArgs.emojiKey ?? ""),
        },
      };
    case "REACTED_THRESHOLD":
      return {
        type: "REACTED_THRESHOLD",
        args: {
          emojiKey: String(baseArgs.emojiKey ?? ""),
          count: Number.parseInt(String(baseArgs.count ?? "0"), 10),
        },
      };
    case "REPUTATION_THRESHOLD":
      return {
        type: "REPUTATION_THRESHOLD",
        args: {
          minRep: Number.parseInt(String(baseArgs.minRep ?? "0"), 10),
        },
      };
    case "ANTIQUITY_THRESHOLD":
      return {
        type: "ANTIQUITY_THRESHOLD",
        args: {
          durationMs: row.durationMs ?? 0,
        },
      };
    default:
      return { type: "MESSAGE_REACT_ANY", args: {} };
  }
}

function toAutoRoleRule(row: AutoRoleRuleDoc): AutoRoleRule {
  return {
    guildId: row.guildId,
    name: row.name,
    trigger: toAutoRoleTrigger(row),
    roleId: row.roleId,
    durationMs: row.durationMs ?? null,
    enabled: row.enabled,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt ?? new Date(0),
    updatedAt: row.updatedAt ?? new Date(0),
  };
}

function toAutoRoleGrant(row: AutoRoleGrantDoc): AutoRoleGrantReason {
  return {
    guildId: row.guildId,
    userId: row.userId,
    roleId: row.roleId,
    ruleName: row.ruleName,
    type: row.type,
    expiresAt: row.expiresAt ?? null,
    createdAt: row.createdAt ?? new Date(0),
    updatedAt: row.updatedAt ?? new Date(0),
  };
}

function toAutoRoleTally(row: AutoRoleReactionTallyDoc): ReactionTallySnapshot {
  return {
    key: {
      guildId: row.guildId,
      messageId: row.messageId,
      emojiKey: row.emojiKey,
    },
    authorId: row.authorId,
    count: row.count ?? 0,
    updatedAt: row.updatedAt ?? new Date(0),
  };
}

// --- Rules (CRUD) ---

/**
 * Fetch all rules for a specific guild.
 */
export async function autoRoleFetchRulesByGuild(
  guildId: string,
): Promise<AutoRoleRule[]> {
  await connectMongo();
  const rows = await AutoRoleRuleModel.find({ guildId }).lean();
  return rows.map(toAutoRoleRule);
}

/**
 * Fetch all rules across all guilds (used for scheduler).
 */
export async function autoRoleFetchAllRules(): Promise<AutoRoleRule[]> {
  await connectMongo();
  const rows = await AutoRoleRuleModel.find().lean();
  return rows.map(toAutoRoleRule);
}

/**
 * Fetch a single rule by name within a guild.
 */
export async function autoRoleFetchRule(
  guildId: string,
  name: string,
): Promise<AutoRoleRule | null> {
  await connectMongo();
  const row = await AutoRoleRuleModel.findOne({ guildId, name }).lean();
  return row ? toAutoRoleRule(row) : null;
}

export async function autoRoleListRuleNames(guildId: string): Promise<string[]> {
  await connectMongo();
  const rows = await AutoRoleRuleModel.find({ guildId })
    .select({ name: 1, _id: 0 })
    .lean();
  return rows.map((row: any) => row.name);
}

export async function autoRoleInsertRule(
  input: CreateAutoRoleRuleInput,
): Promise<AutoRoleRule> {
  await connectMongo();
  const payload: AutoRoleRuleDoc = {
    _id: ruleKey(input.guildId, input.name),
    id: ruleKey(input.guildId, input.name),
    guildId: input.guildId,
    name: input.name,
    triggerType: input.trigger.type,
    args: input.trigger.args,
    roleId: input.roleId,
    durationMs: input.durationMs ?? null,
    enabled: input.enabled ?? true,
    createdBy: input.createdBy ?? null,
  } as AutoRoleRuleDoc;

  const doc = await new AutoRoleRuleModel(payload).save();
  return toAutoRoleRule(doc.toObject() as AutoRoleRuleDoc);
}

export async function autoRoleUpdateRuleEnabled({
  guildId,
  name,
  enabled,
}: UpdateRuleEnabledInput): Promise<AutoRoleRule | null> {
  await connectMongo();
  const row = await AutoRoleRuleModel.findOneAndUpdate(
    { guildId, name },
    { $set: { enabled, updatedAt: new Date() } },
    { new: true, lean: true },
  );
  return row ? toAutoRoleRule(row) : null;
}

export async function autoRoleDeleteRule(
  input: DeleteRuleInput,
): Promise<boolean> {
  await connectMongo();
  await AutoRoleGrantModel.deleteMany({
    guildId: input.guildId,
    ruleName: input.name,
  });
  const res = await AutoRoleRuleModel.deleteOne({
    guildId: input.guildId,
    name: input.name,
  });
  return (res.deletedCount ?? 0) > 0;
}

// --- Grants ---

/**
 * Insert or update a role grant record.
 */
export async function autoRoleUpsertGrant(
  input: GrantByRuleInput,
): Promise<AutoRoleGrantReason> {
  await connectMongo();
  const doc = await AutoRoleGrantModel.findOneAndUpdate(
    {
      _id: grantKey(
        input.guildId,
        input.userId,
        input.roleId,
        input.ruleName,
        input.type,
      ),
    },
    {
      $set: {
        guildId: input.guildId,
        userId: input.userId,
        roleId: input.roleId,
        ruleName: input.ruleName,
        type: input.type,
        expiresAt: input.expiresAt ?? null,
      },
      $setOnInsert: { createdAt: new Date() },
      $currentDate: { updatedAt: true },
    },
    { upsert: true, new: true, lean: true },
  );
  return toAutoRoleGrant(doc!);
}

/**
 * Delete a specific grant.
 */
export async function autoRoleDeleteGrant(
  input: RevokeByRuleInput,
): Promise<boolean> {
  await connectMongo();
  const res = await AutoRoleGrantModel.deleteOne({
    guildId: input.guildId,
    userId: input.userId,
    roleId: input.roleId,
    ruleName: input.ruleName,
    type: input.type,
  });
  return (res.deletedCount ?? 0) > 0;
}

/**
 * List all grants for a specific member and role.
 */
export async function autoRoleListReasonsForMemberRole(
  guildId: string,
  userId: string,
  roleId: string,
): Promise<AutoRoleGrantReason[]> {
  await connectMongo();
  const rows = await AutoRoleGrantModel.find({ guildId, userId, roleId }).lean();
  return rows.map(toAutoRoleGrant);
}

/**
 * List all grants associated with a specific rule.
 */
export async function autoRoleListReasonsForRule(
  guildId: string,
  ruleName: string,
): Promise<AutoRoleGrantReason[]> {
  await connectMongo();
  const rows = await AutoRoleGrantModel.find({ guildId, ruleName }).lean();
  return rows.map(toAutoRoleGrant);
}

/**
 * Count how many grants a user has for a specific role.
 */
export async function autoRoleCountReasonsForRole(
  guildId: string,
  userId: string,
  roleId: string,
): Promise<number> {
  await connectMongo();
  const total = await AutoRoleGrantModel.countDocuments({
    guildId,
    userId,
    roleId,
  });
  return Number(total ?? 0);
}

export async function autoRolePurgeGrantsForRule(
  guildId: string,
  ruleName: string,
): Promise<number> {
  await connectMongo();
  const res = await AutoRoleGrantModel.deleteMany({ guildId, ruleName });
  return res.deletedCount ?? 0;
}

export async function autoRolePurgeGrantsForGuildRole(
  guildId: string,
  roleId: string,
): Promise<number> {
  await connectMongo();
  const res = await AutoRoleGrantModel.deleteMany({ guildId, roleId });
  return res.deletedCount ?? 0;
}

/**
 * Find a specific grant.
 */
export async function autoRoleFindGrant(
  guildId: string,
  userId: string,
  roleId: string,
  ruleName: string,
  type: "LIVE" | "TIMED",
): Promise<AutoRoleGrantReason | null> {
  await connectMongo();
  const row = await AutoRoleGrantModel.findOne({
    guildId,
    userId,
    roleId,
    ruleName,
    type,
  }).lean();
  return row ? toAutoRoleGrant(row) : null;
}

/**
 * List all timed grants that have expired.
 */
export async function autoRoleListDueTimedGrants(
  reference: Date,
): Promise<AutoRoleGrantReason[]> {
  await connectMongo();
  const rows = await AutoRoleGrantModel.find({
    type: "TIMED",
    expiresAt: { $ne: null, $lte: reference },
  }).lean();
  return rows.map(toAutoRoleGrant);
}

// --- Tallies ---

export async function autoRoleDeleteTalliesForMessage(
  guildId: string,
  messageId: string,
): Promise<number> {
  await connectMongo();
  const res = await AutoRoleReactionTallyModel.deleteMany({ guildId, messageId });
  return res.deletedCount ?? 0;
}

export async function autoRoleListTalliesForMessage(
  guildId: string,
  messageId: string,
): Promise<ReactionTallySnapshot[]> {
  await connectMongo();
  const rows = await AutoRoleReactionTallyModel.find({ guildId, messageId }).lean();
  return rows.map(toAutoRoleTally);
}

export async function autoRoleIncrementReactionTally(
  key: ReactionTallyKey,
  authorId: string,
): Promise<ReactionTallySnapshot> {
  await connectMongo();
  const doc = await AutoRoleReactionTallyModel.findOneAndUpdate(
    { _id: tallyKey(key.guildId, key.messageId, key.emojiKey) },
    {
      $setOnInsert: {
        guildId: key.guildId,
        messageId: key.messageId,
        emojiKey: key.emojiKey,
        count: 0,
      },
      $set: { authorId },
      $inc: { count: 1 },
      $currentDate: { updatedAt: true },
    },
    { upsert: true, new: true, lean: true },
  );
  const snapshot = toAutoRoleTally(doc!);
  setTally(snapshot);
  return snapshot;
}

export async function autoRoleDecrementReactionTally(
  key: ReactionTallyKey,
): Promise<ReactionTallySnapshot | null> {
  await connectMongo();
  const doc = await AutoRoleReactionTallyModel.findOneAndUpdate(
    { _id: tallyKey(key.guildId, key.messageId, key.emojiKey) },
    { $inc: { count: -1 }, $currentDate: { updatedAt: true } },
    { new: true, lean: true },
  );
  if (!doc) return null;

  if ((doc.count ?? 0) <= 0) {
    await AutoRoleReactionTallyModel.deleteOne({ _id: doc._id });
    deleteTally(key);
  } else {
    const snapshot = toAutoRoleTally(doc);
    setTally(snapshot);
    return snapshot;
  }

  return toAutoRoleTally({
    ...doc,
    count: Math.max(doc.count ?? 0, 0),
  } as any);
}

export async function autoRoleReadReactionTally(
  key: ReactionTallyKey,
): Promise<ReactionTallySnapshot | null> {
  const cached = getTally(key);
  if (cached) return cached;

  await connectMongo();
  const row = await AutoRoleReactionTallyModel.findOne({
    guildId: key.guildId,
    messageId: key.messageId,
    emojiKey: key.emojiKey,
  }).lean();
  if (row) {
    const snapshot = toAutoRoleTally({
      ...row,
      count: Math.max(row.count ?? 0, 0),
    } as any);
    setTally(snapshot);
    return snapshot;
  }
  return null;
}

export async function autoRoleDeleteReactionTally(
  key: ReactionTallyKey,
): Promise<boolean> {
  await connectMongo();
  const res = await AutoRoleReactionTallyModel.deleteOne({
    guildId: key.guildId,
    messageId: key.messageId,
    emojiKey: key.emojiKey,
  });
  deleteTally(key);
  return (res.deletedCount ?? 0) > 0;
}

// --- Higher level helpers mirroring the Postgres repo ---

export async function loadRulesIntoCache(): Promise<void> {
  const all = await autoRoleFetchAllRules();
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
  const rules = await autoRoleFetchRulesByGuild(guildId);
  const enabledOnly = rules.filter((rule) => rule.enabled);
  setGuildRules(guildId, enabledOnly);
  return rules;
}

export async function createRule(
  input: CreateAutoRoleRuleInput,
): Promise<AutoRoleRule> {
  const rule = await autoRoleInsertRule(input);
  await refreshGuildRules(rule.guildId);
  return rule;
}

export async function enableRule(
  guildId: string,
  name: string,
): Promise<AutoRoleRule | null> {
  const rule = await autoRoleUpdateRuleEnabled({
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
  const rule = await autoRoleUpdateRuleEnabled({
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
  const deleted = await autoRoleDeleteRule({ guildId, name });
  if (deleted) {
    removeRuleFromCache(guildId, name);
  }
  return deleted;
}

interface AutoroleGrantContext {
  client: UsingClient;
  rule: AutoRoleRule;
  userId: string;
  reason: string;
}

interface AutoroleRevokeContext {
  client: UsingClient;
  rule: AutoRoleRule;
  userId: string;
  reason: string;
  grantType: "LIVE" | "TIMED";
}

export async function grantByRule({
  client,
  rule,
  userId,
  reason,
}: AutoroleGrantContext): Promise<AutoRoleGrantReason> {
  const grantType = isLiveRule(rule.durationMs) ? "LIVE" : "TIMED";

  const existingGrant = await autoRoleFindGrant(
    rule.guildId,
    userId,
    rule.roleId,
    rule.name,
    grantType,
  );
  const existingReasons = await autoRoleCountReasonsForRole(
    rule.guildId,
    userId,
    rule.roleId,
  );

  let expiresAt: Date | null = null;
  if (grantType === "TIMED") {
    const now = Date.now();
    const base = existingGrant?.expiresAt?.getTime() ?? now;
    const duration = rule.durationMs ?? 0;
    expiresAt = new Date(Math.max(base, now) + duration);
  }

  const stored = await autoRoleUpsertGrant({
    guildId: rule.guildId,
    userId,
    roleId: rule.roleId,
    ruleName: rule.name,
    type: grantType,
    expiresAt,
  });

  const isNewReason = !existingGrant;
  const shouldGrantRole = isNewReason && existingReasons === 0;

  if (shouldGrantRole) {
    await enqueueRoleGrant(client, {
      guildId: rule.guildId,
      userId,
      roleId: rule.roleId,
      reason,
    });
    await notifyRoleGranted(client, rule, userId);
  }

  client.logger?.debug?.("[autorole] grant by rule", {
    guildId: rule.guildId,
    ruleName: rule.name,
    targetUserId: userId,
    roleId: rule.roleId,
    type: grantType,
    expiresAt: stored.expiresAt?.toISOString() ?? null,
    reason,
  });

  return stored;
}

export async function revokeByRule({
  client,
  rule,
  userId,
  reason,
  grantType,
}: AutoroleRevokeContext): Promise<boolean> {
  const existing = await autoRoleFindGrant(
    rule.guildId,
    userId,
    rule.roleId,
    rule.name,
    grantType,
  );
  if (!existing) return false;

  const removed = await autoRoleDeleteGrant({
    guildId: rule.guildId,
    userId,
    roleId: rule.roleId,
    ruleName: rule.name,
    type: grantType,
  });
  if (!removed) return false;

  const remaining = await autoRoleCountReasonsForRole(
    rule.guildId,
    userId,
    rule.roleId,
  );
  if (remaining === 0) {
    await enqueueRoleRevoke(client, {
      guildId: rule.guildId,
      userId,
      roleId: rule.roleId,
      reason,
    });
  }

  client.logger?.debug?.("[autorole] revoke by rule", {
    guildId: rule.guildId,
    ruleName: rule.name,
    targetUserId: userId,
    roleId: rule.roleId,
    type: grantType,
    reason,
  });

  return true;
}

export async function purgeRule(
  client: UsingClient,
  guildId: string,
  ruleName: string,
): Promise<{ removedGrants: number; roleRevocations: number }> {
  const grants = await autoRoleListReasonsForRule(guildId, ruleName);
  if (grants.length === 0) {
    return { removedGrants: 0, roleRevocations: 0 };
  }

  const removed = await autoRolePurgeGrantsForRule(guildId, ruleName);

  const uniquePairs = new Map<string, { userId: string; roleId: string }>();
  for (const grant of grants) {
    const key = `${grant.userId}:${grant.roleId}`;
    if (!uniquePairs.has(key)) {
      uniquePairs.set(key, {
        userId: grant.userId,
        roleId: grant.roleId,
      });
    }
  }

  let revocations = 0;
  for (const pair of uniquePairs.values()) {
    const remaining = await autoRoleCountReasonsForRole(
      guildId,
      pair.userId,
      pair.roleId,
    );
    if (remaining === 0) {
      revocations += 1;
      await enqueueRoleRevoke(client, {
        guildId,
        userId: pair.userId,
        roleId: pair.roleId,
        reason: `autorole:${ruleName}:purge`,
      });
    }
  }

  return {
    removedGrants: removed,
    roleRevocations: revocations,
  };
}

export async function drainMessageState(
  guildId: string,
  messageId: string,
): Promise<{
  presence: ReactionPresenceKey[];
  tallies: ReactionTallySnapshot[];
}> {
  const presence = clearPresenceForMessage(guildId, messageId);
  const tallies = await autoRoleListTalliesForMessage(guildId, messageId);
  deleteTalliesForMessage(guildId, messageId);
  if (tallies.length > 0) {
    await autoRoleDeleteTalliesForMessage(guildId, messageId);
  }
  return { presence, tallies };
}

export function incrementReactionTally(
  key: ReactionTallyKey,
  authorId: string,
): Promise<ReactionTallySnapshot> {
  return autoRoleIncrementReactionTally(key, authorId);
}

export function decrementReactionTally(
  key: ReactionTallyKey,
): Promise<ReactionTallySnapshot | null> {
  return autoRoleDecrementReactionTally(key);
}

export function readReactionTally(
  key: ReactionTallyKey,
): Promise<ReactionTallySnapshot | null> {
  return autoRoleReadReactionTally(key);
}

export async function removeReactionTally(
  key: ReactionTallyKey,
): Promise<void> {
  await autoRoleDeleteReactionTally(key);
}

export function trackPresence(key: ReactionPresenceKey): void {
  markPresence(key);
}

export function clearTrackedPresence(key: ReactionPresenceKey): void {
  clearPresence(key);
}

// --- Reputation presets ---

interface ReputationRuleInput {
  guildId: string;
  name: string;
  minRep: number;
  roleId: string;
  createdBy?: string | null;
}

export async function upsertReputationRule(
  input: ReputationRuleInput,
): Promise<AutoRoleRule> {
  await ensureGuild(input.guildId);
  const payload = {
    guildId: input.guildId,
    name: input.name,
    triggerType: "REPUTATION_THRESHOLD" as const,
    args: { minRep: input.minRep },
    roleId: input.roleId,
    durationMs: null,
    enabled: true,
    createdBy: input.createdBy ?? null,
  };

  await connectMongo();
  const doc = await AutoRoleRuleModel.findOneAndUpdate(
    { guildId: input.guildId, name: input.name },
    {
      $set: {
        triggerType: "REPUTATION_THRESHOLD",
        args: payload.args,
        roleId: input.roleId,
        enabled: true,
        updatedAt: new Date(),
        createdBy: payload.createdBy,
      },
      $setOnInsert: {
        _id: ruleKey(input.guildId, input.name),
        durationMs: payload.durationMs,
        createdAt: new Date(),
      },
    },
    { upsert: true, new: true, lean: true },
  );

  const rule = toAutoRoleRule(doc!);
  upsertRuleInCache(rule);
  return rule;
}

export async function applyReputationPreset(
  guildId: string,
  entries: Array<{ name: string; minRep: number; roleId: string }>,
  createdBy?: string | null,
): Promise<AutoRoleRule[]> {
  const applied: AutoRoleRule[] = [];
  for (const entry of entries) {
    const rule = await upsertReputationRule({
      guildId,
      name: entry.name,
      minRep: entry.minRep,
      roleId: entry.roleId,
      createdBy,
    });
    applied.push(rule);
  }

  const keep = new Set(entries.map((entry) => entry.name));
  const existing = await autoRoleFetchRulesByGuild(guildId);
  for (const rule of existing) {
    if (rule.trigger.type === "REPUTATION_THRESHOLD" && !keep.has(rule.name)) {
      await autoRoleDeleteRule({ guildId, name: rule.name });
    }
  }

  return applied;
}

// --- Internal ---

async function notifyRoleGranted(
  client: UsingClient,
  rule: AutoRoleRule,
  userId: string,
): Promise<void> {
  try {
    const roleName = (await client.roles.fetch(rule.guildId, rule.roleId)).name;

    const guild = await client.guilds.fetch(rule.guildId).catch(() => null);
    const guildName = guild?.name ?? "el servidor";
    const duration = rule.durationMs ? formatMs(rule.durationMs, true) : null;

    const lines = [
      `**[${guildName}]** Has recibido el rol \`@${roleName}\`.`,
      duration ? `Duracion: ${duration}.` : "Duracion: condicional.",
    ];

    await client.users.write(userId, {
      content: lines.join("\n"),
      allowed_mentions: { parse: [] },
    });
  } catch (error) {
    client.logger?.debug?.("[autorole] failed to DM role grant notice", {
      guildId: rule.guildId,
      userId,
      roleId: rule.roleId,
      error,
    });
  }
}
