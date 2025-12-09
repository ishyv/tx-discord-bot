/**
 * Author: Repositories team
 * Purpose: Provides grouped Mongo persistence APIs for autorole rules, grants, and tallies.
 * Why exists: Keeps raw database access isolated from cache/business layers, with consistent connection handling and projections.
 */
import { connectMongo } from "@/db/client";
import {
  AutoRoleGrantModel,
  AutoRoleReactionTallyModel,
  AutoRoleRuleModel,
  type AutoRoleGrantDoc,
  type AutoRoleReactionTallyDoc,
  type AutoRoleRuleDoc,
} from "@/db/models/autorole.schema";
import type {
  AutoRoleGrantReason,
  AutoRoleRule,
  CreateAutoRoleRuleInput,
  DeleteRuleInput,
  GrantByRuleInput,
  ReactionTallyKey,
  ReactionTallySnapshot,
  RevokeByRuleInput,
  UpdateRuleEnabledInput,
} from "@/modules/autorole/types";
import {
  encodeTrigger,
  toAutoRoleGrant,
  toAutoRoleRule,
  toAutoRoleTally,
} from "./autorole.mappers";

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

async function withMongo<T>(fn: () => Promise<T>): Promise<T> {
  await connectMongo();
  return fn();
}

function normalizeTally(
  doc: AutoRoleReactionTallyDoc,
): ReactionTallySnapshot {
  return toAutoRoleTally({
    ...doc,
    count: Math.max(doc.count ?? 0, 0),
  } as AutoRoleReactionTallyDoc);
}

export const AutoRoleRulesRepo = {
  fetchByGuild(guildId: string): Promise<AutoRoleRule[]> {
    return withMongo(async () => {
      const rows = await AutoRoleRuleModel.find({ guildId }).lean();
      return rows.map(toAutoRoleRule);
    });
  },

  fetchAll(): Promise<AutoRoleRule[]> {
    return withMongo(async () => {
      const rows = await AutoRoleRuleModel.find().lean();
      return rows.map(toAutoRoleRule);
    });
  },

  fetchOne(guildId: string, name: string): Promise<AutoRoleRule | null> {
    return withMongo(async () => {
      const row = await AutoRoleRuleModel.findOne({ guildId, name }).lean();
      return row ? toAutoRoleRule(row) : null;
    });
  },

  listNames(guildId: string): Promise<string[]> {
    return withMongo(async () => {
      const rows = await AutoRoleRuleModel.find({ guildId })
        .select({ name: 1, _id: 0 })
        .lean();
      return (rows as Array<{ name: string }>).map((row) => row.name);
    });
  },

  insert(input: CreateAutoRoleRuleInput): Promise<AutoRoleRule> {
    return withMongo(async () => {
      const { durationMs: encodedDuration, ...encodedTrigger } = encodeTrigger(
        input.trigger,
      );
      const payload: AutoRoleRuleDoc = {
        _id: ruleKey(input.guildId, input.name),
        id: ruleKey(input.guildId, input.name),
        guildId: input.guildId,
        name: input.name,
        roleId: input.roleId,
        durationMs: encodedDuration ?? input.durationMs ?? null,
        enabled: input.enabled ?? true,
        createdBy: input.createdBy ?? null,
        ...encodedTrigger,
      } as AutoRoleRuleDoc;

      const doc = await new AutoRoleRuleModel(payload).save();
      return toAutoRoleRule(doc.toObject() as AutoRoleRuleDoc);
    });
  },

  upsert(input: CreateAutoRoleRuleInput): Promise<AutoRoleRule> {
    return withMongo(async () => {
      const { durationMs: encodedDuration, ...encodedTrigger } = encodeTrigger(
        input.trigger,
      );
      const row = await AutoRoleRuleModel.findOneAndUpdate(
        { guildId: input.guildId, name: input.name },
        {
          $set: {
            roleId: input.roleId,
            enabled: input.enabled ?? true,
            durationMs: encodedDuration ?? input.durationMs ?? null,
            updatedAt: new Date(),
            createdBy: input.createdBy ?? null,
            ...encodedTrigger,
          },
          $setOnInsert: {
            _id: ruleKey(input.guildId, input.name),
            id: ruleKey(input.guildId, input.name),
            createdAt: new Date(),
          },
        },
        { new: true, upsert: true, lean: true },
      );
      return toAutoRoleRule(row as AutoRoleRuleDoc);
    });
  },

  updateEnabled({
    guildId,
    name,
    enabled,
  }: UpdateRuleEnabledInput): Promise<AutoRoleRule | null> {
    return withMongo(async () => {
      const row = await AutoRoleRuleModel.findOneAndUpdate(
        { guildId, name },
        { $set: { enabled, updatedAt: new Date() } },
        { new: true, lean: true },
      );
      return row ? toAutoRoleRule(row) : null;
    });
  },

  delete(input: DeleteRuleInput): Promise<boolean> {
    return withMongo(async () => {
      await AutoRoleGrantModel.deleteMany({
        guildId: input.guildId,
        ruleName: input.name,
      });
      const res = await AutoRoleRuleModel.deleteOne({
        guildId: input.guildId,
        name: input.name,
      });
      return (res.deletedCount ?? 0) > 0;
    });
  },
};

export const AutoRoleGrantsRepo = {
  upsert(input: GrantByRuleInput): Promise<AutoRoleGrantReason> {
    return withMongo(async () => {
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
      return toAutoRoleGrant(doc as AutoRoleGrantDoc);
    });
  },

  deleteOne(input: RevokeByRuleInput): Promise<boolean> {
    return withMongo(async () => {
      const res = await AutoRoleGrantModel.deleteOne({
        guildId: input.guildId,
        userId: input.userId,
        roleId: input.roleId,
        ruleName: input.ruleName,
        type: input.type,
      });
      return (res.deletedCount ?? 0) > 0;
    });
  },

  listForMemberRole(
    guildId: string,
    userId: string,
    roleId: string,
  ): Promise<AutoRoleGrantReason[]> {
    return withMongo(async () => {
      const rows = await AutoRoleGrantModel.find({ guildId, userId, roleId }).lean();
      return rows.map(toAutoRoleGrant);
    });
  },

  listForRule(
    guildId: string,
    ruleName: string,
  ): Promise<AutoRoleGrantReason[]> {
    return withMongo(async () => {
      const rows = await AutoRoleGrantModel.find({ guildId, ruleName }).lean();
      return rows.map(toAutoRoleGrant);
    });
  },

  countForRole(
    guildId: string,
    userId: string,
    roleId: string,
  ): Promise<number> {
    return withMongo(async () => {
      const total = await AutoRoleGrantModel.countDocuments({
        guildId,
        userId,
        roleId,
      });
      return Number(total ?? 0);
    });
  },

  purgeForRule(guildId: string, ruleName: string): Promise<number> {
    return withMongo(async () => {
      const res = await AutoRoleGrantModel.deleteMany({ guildId, ruleName });
      return res.deletedCount ?? 0;
    });
  },

  purgeForGuildRole(guildId: string, roleId: string): Promise<number> {
    return withMongo(async () => {
      const res = await AutoRoleGrantModel.deleteMany({ guildId, roleId });
      return res.deletedCount ?? 0;
    });
  },

  find(
    guildId: string,
    userId: string,
    roleId: string,
    ruleName: string,
    type: "LIVE" | "TIMED",
  ): Promise<AutoRoleGrantReason | null> {
    return withMongo(async () => {
      const row = await AutoRoleGrantModel.findOne({
        guildId,
        userId,
        roleId,
        ruleName,
        type,
      }).lean();
      return row ? toAutoRoleGrant(row) : null;
    });
  },

  listDueTimed(reference: Date): Promise<AutoRoleGrantReason[]> {
    return withMongo(async () => {
      const rows = await AutoRoleGrantModel.find({
        type: "TIMED",
        expiresAt: { $ne: null, $lte: reference },
      }).lean();
      return rows.map(toAutoRoleGrant);
    });
  },
};

export const AutoRoleTalliesRepo = {
  deleteForMessage(guildId: string, messageId: string): Promise<number> {
    return withMongo(async () => {
      const res = await AutoRoleReactionTallyModel.deleteMany({
        guildId,
        messageId,
      });
      return res.deletedCount ?? 0;
    });
  },

  listForMessage(
    guildId: string,
    messageId: string,
  ): Promise<ReactionTallySnapshot[]> {
    return withMongo(async () => {
      const rows = await AutoRoleReactionTallyModel.find({ guildId, messageId }).lean();
      return rows.map(toAutoRoleTally);
    });
  },

  increment(
    key: ReactionTallyKey,
    authorId: string,
  ): Promise<ReactionTallySnapshot> {
    return withMongo(async () => {
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
      return normalizeTally(doc as AutoRoleReactionTallyDoc);
    });
  },

  decrement(key: ReactionTallyKey): Promise<ReactionTallySnapshot | null> {
    return withMongo(async () => {
      const doc = await AutoRoleReactionTallyModel.findOneAndUpdate(
        { _id: tallyKey(key.guildId, key.messageId, key.emojiKey) },
        { $inc: { count: -1 }, $currentDate: { updatedAt: true } },
        { new: true, lean: true },
      );
      if (!doc) return null;

      if ((doc.count ?? 0) <= 0) {
        await AutoRoleReactionTallyModel.deleteOne({ _id: doc._id });
      }

      return normalizeTally({
        ...doc,
        count: Math.max(doc.count ?? 0, 0),
      } as AutoRoleReactionTallyDoc);
    });
  },

  read(key: ReactionTallyKey): Promise<ReactionTallySnapshot | null> {
    return withMongo(async () => {
      const row = await AutoRoleReactionTallyModel.findOne({
        guildId: key.guildId,
        messageId: key.messageId,
        emojiKey: key.emojiKey,
      }).lean();
      return row
        ? normalizeTally({
          ...row,
          count: Math.max(row.count ?? 0, 0),
        } as AutoRoleReactionTallyDoc)
        : null;
    });
  },

  deleteOne(key: ReactionTallyKey): Promise<boolean> {
    return withMongo(async () => {
      const res = await AutoRoleReactionTallyModel.deleteOne({
        guildId: key.guildId,
        messageId: key.messageId,
        emojiKey: key.emojiKey,
      });
      return (res.deletedCount ?? 0) > 0;
    });
  },
};
