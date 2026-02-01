import { MongoStore } from "@/db/mongo-store";
import {
  AutoRoleRuleSchema,
  AutoRoleGrantSchema,
  AutoRoleTallySchema,
  type AutoRoleRuleRow,
  type AutoRoleGrantRow,
  type AutoRoleTallyRow,
} from "../domain/schema";

/**
 * Composite key stable generators.
 */
export const autoroleKeys = {
  rule: (guildId: string, name: string) => `${guildId}:${name}`,
  grant: (
    guildId: string,
    userId: string,
    roleId: string,
    ruleName: string,
    type: string,
  ) => `${guildId}:${userId}:${roleId}:${ruleName}:${type}`,
  tally: (guildId: string, messageId: string, emojiKey: string) =>
    `${guildId}:${messageId}:${emojiKey}`,
};

/**
 * Persistence for Autorole Rules.
 */
export const AutoRoleRulesStore = new MongoStore<AutoRoleRuleRow>(
  "autorole_rules",
  AutoRoleRuleSchema,
);

/**
 * Persistence for Autorole Grants.
 */
export const AutoRoleGrantsStore = new MongoStore<AutoRoleGrantRow>(
  "autorole_role_grants",
  AutoRoleGrantSchema,
);

/**
 * Persistence for Autorole Tallies (reaction counters).
 */
export const AutoRoleTalliesStore = new MongoStore<AutoRoleTallyRow>(
  "autorole_reaction_tallies",
  AutoRoleTallySchema,
);

export async function ensureAutoroleIndexes(): Promise<void> {
  try {
    const rules = await AutoRoleRulesStore.collection();
    await rules.createIndex({ guildId: 1 });
    await rules.createIndex({ guildId: 1, enabled: 1 });

    const grants = await AutoRoleGrantsStore.collection();
    await grants.createIndex({ type: 1, expiresAt: 1 });
    await grants.createIndex({ guildId: 1, ruleName: 1 });
    await grants.createIndex({ guildId: 1, userId: 1, roleId: 1 });

    const tallies = await AutoRoleTalliesStore.collection();
    await tallies.createIndex({ guildId: 1, messageId: 1 });
  } catch {
    return;
  }
}

export async function purgeInvalidAutoroleDocs(): Promise<{
  rulesDeleted: number;
  grantsDeleted: number;
  talliesDeleted: number;
}> {
  let rulesDeleted = 0;
  let grantsDeleted = 0;
  let talliesDeleted = 0;

  const SNOWFLAKE_REGEX = /^\d{17,20}$/;

  try {
    const rules = await AutoRoleRulesStore.collection();
    const del = await rules.deleteMany({
      $or: [
        { guildId: { $exists: false } },
        { guildId: { $not: SNOWFLAKE_REGEX } },
      ],
    } as any);
    rulesDeleted = del.deletedCount ?? 0;
  } catch {
    // ignore
  }

  try {
    const grants = await AutoRoleGrantsStore.collection();
    const del = await grants.deleteMany({
      $or: [
        { guildId: { $exists: false } },
        { userId: { $exists: false } },
        { roleId: { $exists: false } },
        { guildId: { $not: SNOWFLAKE_REGEX } },
        { userId: { $not: SNOWFLAKE_REGEX } },
        { roleId: { $not: SNOWFLAKE_REGEX } },
        { type: { $nin: ["LIVE", "TIMED"] } },
      ],
    } as any);
    grantsDeleted = del.deletedCount ?? 0;
  } catch {
    // ignore
  }

  try {
    const tallies = await AutoRoleTalliesStore.collection();
    const del = await tallies.deleteMany({
      $or: [
        { guildId: { $exists: false } },
        { messageId: { $exists: false } },
        { emojiKey: { $exists: false } },
        { guildId: { $not: SNOWFLAKE_REGEX } },
        { messageId: { $not: SNOWFLAKE_REGEX } },
      ],
    } as any);
    talliesDeleted = del.deletedCount ?? 0;
  } catch {
    // ignore
  }

  return { rulesDeleted, grantsDeleted, talliesDeleted };
}
