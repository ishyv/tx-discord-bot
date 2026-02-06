import type { UsingClient } from "seyfert";
import { format as formatMs } from "@/utils/ms";
import { isLiveRule } from "./domain/parsers";
import type { AutoRoleGrantType, AutoRoleRule } from "./domain/types";
import {
  AutoRoleGrantsStore,
  AutoRoleRulesStore,
  AutoRoleTalliesStore,
  autoroleKeys,
} from "./data/store";
import { enqueueRoleGrant, enqueueRoleRevoke } from "./engine/roleOps";
import {
  clearPresenceForMessage,
  deleteTalliesForMessage,
  getGuildRules,
  setTally,
  deleteTally,
  removeRule as removeRuleFromCache,
  upsertRule as upsertRuleInCache,
} from "./cache";
import { isFeatureEnabled, Features } from "@/modules/features";
import type {
  ReactionTallyKey,
  ReactionTallySnapshot,
  ReactionPresenceKey,
  CreateAutoRoleRuleInput,
} from "./domain/types";

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
  grantType: AutoRoleGrantType;
}

/**
 * Business logic for Autorole management.
 */
export class AutoroleService {
  /**
   * Registers a grant reason and actually grants the role in Discord if needed.
   */
  static async grantByRule({
    client,
    rule,
    userId,
    reason,
  }: AutoroleGrantContext) {
    const grantType: AutoRoleGrantType = isLiveRule(rule.durationMs)
      ? "LIVE"
      : "TIMED";
    const grantId = autoroleKeys.grant(
      rule.guildId,
      userId,
      rule.roleId,
      rule.name,
      grantType,
    );

    const existingRes = await AutoRoleGrantsStore.get(grantId);
    if (existingRes.isErr()) return existingRes;
    const existingGrant = existingRes.unwrap();

    const countRes = await AutoRoleGrantsStore.find({
      guildId: rule.guildId,
      userId,
      roleId: rule.roleId,
    });
    if (countRes.isErr()) return countRes;
    const existingReasonsCount = countRes.unwrap().length;

    let expiresAt: Date | null = null;
    if (grantType === "TIMED") {
      const now = Date.now();
      const base = existingGrant?.expiresAt?.getTime() ?? now;
      const duration = rule.durationMs ?? 0;
      expiresAt = new Date(Math.max(base, now) + duration);
    }

    const storedRes = await AutoRoleGrantsStore.patch(grantId, {
      guildId: rule.guildId,
      userId,
      roleId: rule.roleId,
      ruleName: rule.name,
      type: grantType,
      expiresAt,
    } as any);

    if (storedRes.isErr()) return storedRes;

    const isNewReason = !existingGrant;
    const shouldGrantRole = isNewReason && existingReasonsCount === 0;

    if (shouldGrantRole) {
      await enqueueRoleGrant(client, {
        guildId: rule.guildId,
        userId,
        roleId: rule.roleId,
        reason,
      });
      await this.notifyRoleGranted(client, rule, userId);
    }

    return storedRes;
  }

  /**
   * Removes a grant reason and revokes the role in Discord if no reasons left.
   */
  static async revokeByRule({
    client,
    rule,
    userId,
    reason,
    grantType,
  }: AutoroleRevokeContext): Promise<boolean> {
    const grantId = autoroleKeys.grant(
      rule.guildId,
      userId,
      rule.roleId,
      rule.name,
      grantType,
    );

    const existingRes = await AutoRoleGrantsStore.get(grantId);
    if (existingRes.isErr() || !existingRes.unwrap()) return false;

    const deletedRes = await AutoRoleGrantsStore.delete(grantId);
    if (deletedRes.isErr() || !deletedRes.unwrap()) return false;

    const remainingRes = await AutoRoleGrantsStore.find({
      guildId: rule.guildId,
      userId,
      roleId: rule.roleId,
    });

    if (remainingRes.isOk() && remainingRes.unwrap().length === 0) {
      await enqueueRoleRevoke(client, {
        guildId: rule.guildId,
        userId,
        roleId: rule.roleId,
        reason,
      });
    }

    return true;
  }

  /**
   * Creates a rule, persists it and updates cache.
   */
  static async createRule(
    input: CreateAutoRoleRuleInput,
  ): Promise<AutoRoleRule> {
    const id = autoroleKeys.rule(input.guildId, input.name);
    const rule: AutoRoleRule = {
      _id: id,
      id,
      ...input,
      enabled: input.enabled ?? true,
      createdBy: input.createdBy ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await AutoRoleRulesStore.set(id, rule);
    upsertRuleInCache(rule);
    return rule;
  }

  /**
   * Deletes a rule and refreshes cache.
   */
  static async deleteRule(guildId: string, name: string): Promise<boolean> {
    const id = autoroleKeys.rule(guildId, name);
    const res = await AutoRoleRulesStore.delete(id);
    if (res.isOk() && res.unwrap()) {
      removeRuleFromCache(guildId, name);
      return true;
    }
    return false;
  }

  /**
   * Enables or disables a rule.
   */
  static async toggleRule(
    guildId: string,
    name: string,
    enabled: boolean,
  ): Promise<AutoRoleRule | null> {
    const id = autoroleKeys.rule(guildId, name);
    const res = await AutoRoleRulesStore.patch(id, { enabled } as any);
    if (res.isOk()) {
      const rule = res.unwrap();
      upsertRuleInCache(rule);
      return rule;
    }
    return null;
  }

  /**
   * Purges a rule: removes all grants and enqueues role revokes.
   */
  static async purgeRule(
    client: UsingClient,
    guildId: string,
    ruleName: string,
  ): Promise<{ removedGrants: number; roleRevocations: number }> {
    const grantsRes = await AutoRoleGrantsStore.find({ guildId, ruleName });
    const grants = grantsRes.isOk() ? grantsRes.unwrap() : [];

    if (grants.length === 0) {
      return { removedGrants: 0, roleRevocations: 0 };
    }

    const col = await AutoRoleGrantsStore.collection();
    const removedRes = await col.deleteMany({ guildId, ruleName });
    const removedCount = removedRes.deletedCount ?? 0;

    const uniquePairs = new Map<string, { userId: string; roleId: string }>();
    for (const grant of grants) {
      const key = `${grant.userId}:${grant.roleId}`;
      if (!uniquePairs.has(key)) {
        uniquePairs.set(key, { userId: grant.userId, roleId: grant.roleId });
      }
    }

    let revocations = 0;
    for (const pair of uniquePairs.values()) {
      const remainingRes = await AutoRoleGrantsStore.find({
        guildId,
        userId: pair.userId,
        roleId: pair.roleId,
      });

      if (remainingRes.isOk() && remainingRes.unwrap().length === 0) {
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
      removedGrants: removedCount,
      roleRevocations: revocations,
    };
  }

  /**
   * Syncs roles based on user reputation.
   */
  static async syncUserReputationRoles(
    client: UsingClient,
    guildId: string,
    userId: string,
    rep: number,
  ): Promise<void> {
    const enabled = await isFeatureEnabled(guildId, Features.Autoroles);
    if (!enabled) return;

    const cache = getGuildRules(guildId);
    if (!cache.repThresholds.length) return;

    for (const rule of cache.repThresholds) {
      if (rule.trigger.type !== "REPUTATION_THRESHOLD") continue;
      const meets = rep >= rule.trigger.args.minRep;

      if (meets) {
        await this.grantByRule({
          client,
          rule,
          userId,
          reason: `autorole:${rule.name}:rep_threshold`,
        });
      } else {
        await this.revokeByRule({
          client,
          rule,
          userId,
          reason: `autorole:${rule.name}:rep_threshold:fall`,
          grantType: "LIVE",
        });
      }
    }
  }

  /**
   * Syncs roles based on account/member antiquity.
   */
  static async syncUserAntiquityRoles(
    client: UsingClient,
    guildId: string,
    member: { id: string; joinedAt?: string | Date | null },
  ): Promise<void> {
    const enabled = await isFeatureEnabled(guildId, Features.Autoroles);
    if (!enabled) return;

    const cache = getGuildRules(guildId);
    if (!cache.antiquityThresholds.length) return;

    const joinedAt = member.joinedAt ? new Date(member.joinedAt) : null;
    if (!joinedAt) return;

    const now = Date.now();
    const antiquity = now - joinedAt.getTime();

    for (const rule of cache.antiquityThresholds) {
      if (rule.trigger.type !== "ANTIQUITY_THRESHOLD") continue;
      const meets = antiquity >= rule.trigger.args.durationMs;

      if (meets) {
        await this.grantByRule({
          client,
          rule,
          userId: member.id,
          reason: `autorole:${rule.name}:antiquity_threshold`,
        });
      } else {
        await this.revokeByRule({
          client,
          rule,
          userId: member.id,
          reason: `autorole:${rule.name}:antiquity_threshold:fall`,
          grantType: "LIVE",
        });
      }
    }
  }

  /**
   * Increments a reaction tally in DB and cache.
   */
  static async incrementReactionTally(
    key: ReactionTallyKey,
    authorId: string,
  ): Promise<ReactionTallySnapshot> {
    const id = autoroleKeys.tally(key.guildId, key.messageId, key.emojiKey);
    const col = await AutoRoleTalliesStore.collection();

    // Low-level atomic increment
    const res = await col.findOneAndUpdate(
      { _id: id } as any,
      {
        $inc: { count: 1 },
        $set: {
          guildId: key.guildId,
          messageId: key.messageId,
          emojiKey: key.emojiKey,
          authorId,
          updatedAt: new Date(),
        } as any,
        $setOnInsert: { createdAt: new Date() } as any,
      },
      { upsert: true, returnDocument: "after" },
    );

    const snapshot = res as unknown as ReactionTallySnapshot;
    setTally(snapshot);
    return snapshot;
  }

  /**
   * Decrements a reaction tally.
   */
  static async decrementReactionTally(
    key: ReactionTallyKey,
  ): Promise<ReactionTallySnapshot | null> {
    const id = autoroleKeys.tally(key.guildId, key.messageId, key.emojiKey);
    const col = await AutoRoleTalliesStore.collection();

    const res = await col.findOneAndUpdate(
      { _id: id, count: { $gt: 0 } } as any,
      {
        $inc: { count: -1 },
        $set: { updatedAt: new Date() } as any,
      },
      { returnDocument: "after" },
    );

    if (!res) return null;
    const snapshot = res as unknown as ReactionTallySnapshot;

    if (snapshot.count <= 0) {
      await AutoRoleTalliesStore.delete(id);
      deleteTally(key);
    } else {
      setTally(snapshot);
    }

    return snapshot;
  }

  /**
   * Drains state associated with a message.
   */
  static async drainMessageState(
    guildId: string,
    messageId: string,
  ): Promise<{
    presence: ReactionPresenceKey[];
    tallies: ReactionTallySnapshot[];
  }> {
    const presence = clearPresenceForMessage(guildId, messageId);

    const talliesRes = await AutoRoleTalliesStore.find({ guildId, messageId });
    const tallies = talliesRes.isOk() ? talliesRes.unwrap() : [];

    deleteTalliesForMessage(guildId, messageId);
    if (tallies.length > 0) {
      // Use raw delete many for efficiency
      const col = await AutoRoleTalliesStore.collection();
      await col.deleteMany({ guildId, messageId });
    }

    return { presence, tallies };
  }

  /**
   * Sends a DM notification when a role is granted.
   */
  private static async notifyRoleGranted(
    client: UsingClient,
    rule: AutoRoleRule,
    userId: string,
  ): Promise<void> {
    try {
      const role = await client.roles.fetch(rule.guildId, rule.roleId);
      const roleName = role.name;

      const guild = await client.guilds.fetch(rule.guildId).catch(() => null);
      const guildName = guild?.name ?? "the server";
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
}

