import { AutoroleService } from "@/modules/autorole";
import {
  AutoRoleGrantsStore,
  AutoRoleRulesStore,
  AutoRoleTalliesStore,
  autoroleKeys,
} from "@/modules/autorole/data/store";
import { AutoRoleTriggerSchema } from "@/modules/autorole/domain/schema";
import type {
  AutoRoleGrantType,
  AutoRoleRule,
  AutoRoleTrigger,
  DbAutoRoleGrant,
  CreateAutoRoleRuleInput,
  UpdateRuleEnabledInput,
} from "@/modules/autorole/domain/types";
import { deleteTally, setTally } from "@/modules/autorole/cache";

const DEFAULT_TRIGGER: AutoRoleTrigger = {
  type: "MESSAGE_REACT_ANY",
  args: {},
};

const sanitizeTrigger = (trigger: AutoRoleTrigger) => {
  const parsed = AutoRoleTriggerSchema.safeParse(trigger);
  if (parsed.success) {
    return { valid: true, value: parsed.data };
  }
  return { valid: false, value: DEFAULT_TRIGGER };
};

const buildRuleId = (guildId: string, name: string) =>
  autoroleKeys.rule(guildId, name);

const buildRuleDocument = (
  input: CreateAutoRoleRuleInput,
  trigger: AutoRoleTrigger,
  now: Date,
  enabled: boolean,
): AutoRoleRule => {
  const id = buildRuleId(input.guildId, input.name);
  return {
    _id: id,
    id,
    guildId: input.guildId,
    name: input.name,
    roleId: input.roleId,
    trigger,
    durationMs: input.durationMs ?? null,
    enabled,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
};

export const AutoRoleRulesRepo = {
  async insert(input: CreateAutoRoleRuleInput): Promise<AutoRoleRule> {
    const now = new Date();
    const sanitized = sanitizeTrigger(input.trigger);
    const enabled = sanitized.valid ? (input.enabled ?? true) : false;
    const document = buildRuleDocument(input, sanitized.value, now, enabled);

    if (!sanitized.valid) {
      return document;
    }

    const res = await AutoRoleRulesStore.set(document._id, document);
    return res.isOk() ? res.unwrap() : document;
  },

  async upsert(input: CreateAutoRoleRuleInput): Promise<AutoRoleRule> {
    const now = new Date();
    const sanitized = sanitizeTrigger(input.trigger);
    const enabled = sanitized.valid ? (input.enabled ?? true) : false;
    const document = buildRuleDocument(input, sanitized.value, now, enabled);

    const res = await AutoRoleRulesStore.set(document._id, document);
    return res.isOk() ? res.unwrap() : document;
  },

  async fetchOne(guildId: string, name: string): Promise<AutoRoleRule | null> {
    const id = buildRuleId(guildId, name);
    const res = await AutoRoleRulesStore.get(id);
    return res.isOk() ? res.unwrap() : null;
  },

  async fetchByGuild(guildId: string): Promise<AutoRoleRule[]> {
    const res = await AutoRoleRulesStore.find({ guildId });
    return res.isOk() ? res.unwrap() : [];
  },

  async listNames(guildId: string): Promise<string[]> {
    const rules = await AutoRoleRulesRepo.fetchByGuild(guildId);
    return rules.map((rule) => rule.name);
  },

  async fetchAll(): Promise<AutoRoleRule[]> {
    const res = await AutoRoleRulesStore.find({});
    return res.isOk() ? res.unwrap() : [];
  },

  async updateEnabled(
    input: UpdateRuleEnabledInput,
  ): Promise<AutoRoleRule | null> {
    const id = buildRuleId(input.guildId, input.name);
    const res = await AutoRoleRulesStore.patch(id, {
      enabled: input.enabled,
    } as Partial<AutoRoleRule>);
    if (res.isOk()) {
      return res.unwrap();
    }
    return null;
  },

  async delete(input: { guildId: string; name: string }): Promise<boolean> {
    const id = buildRuleId(input.guildId, input.name);
    const res = await AutoRoleRulesStore.delete(id);
    const deleted = res.isOk() ? res.unwrap() : false;
    if (deleted) {
      await AutoRoleGrantsRepo.purgeForRule(input.guildId, input.name);
    }
    return deleted;
  },
};

const buildGrantId = (
  guildId: string,
  userId: string,
  roleId: string,
  ruleName: string,
  type: AutoRoleGrantType,
) => autoroleKeys.grant(guildId, userId, roleId, ruleName, type);

export const AutoRoleGrantsRepo = {
  async upsert(input: {
    guildId: string;
    userId: string;
    roleId: string;
    ruleName: string;
    type: AutoRoleGrantType;
    expiresAt: Date | null;
  }): Promise<DbAutoRoleGrant> {
    const now = new Date();
    const id = buildGrantId(
      input.guildId,
      input.userId,
      input.roleId,
      input.ruleName,
      input.type,
    );
    const document: DbAutoRoleGrant = {
      _id: id,
      guildId: input.guildId,
      userId: input.userId,
      roleId: input.roleId,
      ruleName: input.ruleName,
      type: input.type,
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    const res = await AutoRoleGrantsStore.set(id, document);
    return res.isOk() ? res.unwrap() : document;
  },

  async find(
    guildId: string,
    userId: string,
    roleId: string,
    ruleName: string,
    type: AutoRoleGrantType,
  ): Promise<DbAutoRoleGrant | null> {
    const id = buildGrantId(guildId, userId, roleId, ruleName, type);
    const res = await AutoRoleGrantsStore.get(id);
    return res.isOk() ? res.unwrap() : null;
  },

  async listForMemberRole(
    guildId: string,
    userId: string,
    roleId: string,
  ): Promise<DbAutoRoleGrant[]> {
    const res = await AutoRoleGrantsStore.find({ guildId, userId, roleId });
    return res.isOk() ? res.unwrap() : [];
  },

  async listForRule(
    guildId: string,
    ruleName: string,
  ): Promise<DbAutoRoleGrant[]> {
    const res = await AutoRoleGrantsStore.find({ guildId, ruleName });
    return res.isOk() ? res.unwrap() : [];
  },

  async countForRole(
    guildId: string,
    userId: string,
    roleId: string,
  ): Promise<number> {
    return (await this.listForMemberRole(guildId, userId, roleId)).length;
  },

  async listDueTimed(now: Date): Promise<DbAutoRoleGrant[]> {
    const res = await AutoRoleGrantsStore.find({ type: "TIMED" });
    if (!res.isOk()) return [];
    return res
      .unwrap()
      .filter(
        (grant) =>
          grant.expiresAt !== null &&
          grant.expiresAt.getTime() <= now.getTime(),
      );
  },

  async deleteOne(input: {
    guildId: string;
    userId: string;
    roleId: string;
    ruleName: string;
    type: AutoRoleGrantType;
  }): Promise<boolean> {
    const id = buildGrantId(
      input.guildId,
      input.userId,
      input.roleId,
      input.ruleName,
      input.type,
    );
    const res = await AutoRoleGrantsStore.delete(id);
    return res.isOk() ? res.unwrap() : false;
  },

  async purgeForRule(guildId: string, ruleName: string): Promise<number> {
    try {
      const col = await AutoRoleGrantsStore.collection();
      const res = await col.deleteMany({ guildId, ruleName });
      return res.deletedCount ?? 0;
    } catch {
      return 0;
    }
  },

  async purgeForGuildRole(guildId: string, roleId: string): Promise<number> {
    try {
      const col = await AutoRoleGrantsStore.collection();
      const res = await col.deleteMany({ guildId, roleId });
      return res.deletedCount ?? 0;
    } catch {
      return 0;
    }
  },
};

const buildTallyId = (key: {
  guildId: string;
  messageId: string;
  emojiKey: string;
}) => autoroleKeys.tally(key.guildId, key.messageId, key.emojiKey);

export const AutoRoleTalliesRepo = {
  increment: (
    key: { guildId: string; messageId: string; emojiKey: string },
    authorId: string,
  ) => AutoroleService.incrementReactionTally(key, authorId),

  decrement: (key: { guildId: string; messageId: string; emojiKey: string }) =>
    AutoroleService.decrementReactionTally(key),

  async read(key: { guildId: string; messageId: string; emojiKey: string }) {
    const id = buildTallyId(key);
    const res = await AutoRoleTalliesStore.get(id);
    if (!res.isOk()) return null;
    const tally = res.unwrap();
    if (!tally) return null;
    setTally(tally);
    return tally;
  },

  async listForMessage(guildId: string, messageId: string) {
    const res = await AutoRoleTalliesStore.find({ guildId, messageId });
    return res.isOk() ? res.unwrap() : [];
  },

  async deleteOne(key: {
    guildId: string;
    messageId: string;
    emojiKey: string;
  }) {
    const id = buildTallyId(key);
    const res = await AutoRoleTalliesStore.delete(id);
    if (res.isOk()) {
      deleteTally(key);
      return res.unwrap();
    }
    return false;
  },

  async deleteForMessage(guildId: string, messageId: string) {
    try {
      const col = await AutoRoleTalliesStore.collection();
      const res = await col.deleteMany({ guildId, messageId });
      return res.deletedCount ?? 0;
    } catch {
      return 0;
    }
  },
};
