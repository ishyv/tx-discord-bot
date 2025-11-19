/**
 * Drizzle schema for autorole features.  Keeping enums and composite payload
 * shapes here avoids duplicating raw column names across the repo layer and
 * lets commands consume strongly typed objects.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

export const autoRoleTriggerType = pgEnum("autorole_trigger_type", [
  "MESSAGE_REACT_ANY",
  "REACT_SPECIFIC",
  "REACTED_THRESHOLD",
  "REPUTATION_THRESHOLD",
]);

export const roleGrantType = pgEnum("autorole_grant_type", ["LIVE", "TIMED"]);

interface ReactSpecificArgs {
  messageId: string;
  emojiKey: string;
}

interface ReactedThresholdArgs {
  emojiKey: string;
  count: number;
}

interface ReputationThresholdArgs {
  minRep: number;
}

export type AutoRoleRuleArgs =
  | { type: "MESSAGE_REACT_ANY"; args: Record<string, never> }
  | { type: "REACT_SPECIFIC"; args: ReactSpecificArgs }
  | { type: "REACTED_THRESHOLD"; args: ReactedThresholdArgs }
  | { type: "REPUTATION_THRESHOLD"; args: ReputationThresholdArgs };

export const autoRoleRules = pgTable(
  "autorole_rules",
  {
    guildId: varchar("guild_id", { length: 50 }).notNull(),
    name: varchar("name", { length: 40 }).notNull(),
    triggerType: autoRoleTriggerType("trigger_type").notNull(),
    args: jsonb("args").$type<AutoRoleRuleArgs["args"]>().notNull(),
    roleId: varchar("role_id", { length: 50 }).notNull(),
    durationMs: integer("duration_ms"),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: varchar("created_by", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.guildId, table.name] }),
    guildIdx: index("autorole_rules_guild_idx").on(table.guildId),
    roleIdx: index("autorole_rules_role_idx").on(table.guildId, table.roleId),
  }),
);

export const autoRoleGrants = pgTable(
  "autorole_role_grants",
  {
    guildId: varchar("guild_id", { length: 50 }).notNull(),
    userId: varchar("user_id", { length: 50 }).notNull(),
    roleId: varchar("role_id", { length: 50 }).notNull(),
    ruleName: varchar("rule_name", { length: 40 }).notNull(),
    type: roleGrantType("type").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [
        table.guildId,
        table.userId,
        table.roleId,
        table.ruleName,
        table.type,
      ],
    }),
    memberIdx: index("autorole_grants_member_idx").on(
      table.guildId,
      table.userId,
      table.roleId,
    ),
    ruleIdx: index("autorole_grants_rule_idx").on(
      table.guildId,
      table.ruleName,
    ),
    expiresIdx: index("autorole_grants_expires_idx").on(table.expiresAt),
  }),
);

export const autoRoleReactionTallies = pgTable(
  "autorole_reaction_tallies",
  {
    guildId: varchar("guild_id", { length: 50 }).notNull(),
    messageId: varchar("message_id", { length: 50 }).notNull(),
    emojiKey: varchar("emoji_key", { length: 120 }).notNull(),
    authorId: varchar("author_id", { length: 50 }).notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.guildId, table.messageId, table.emojiKey],
    }),
    emojiIdx: index("autorole_tally_emoji_idx").on(
      table.guildId,
      table.emojiKey,
    ),
    authorIdx: index("autorole_tally_author_idx").on(
      table.guildId,
      table.authorId,
    ),
  }),
);

export type AutoRoleRule = InferSelectModel<typeof autoRoleRules>;
export type NewAutoRoleRule = InferInsertModel<typeof autoRoleRules>;

export type AutoRoleGrant = InferSelectModel<typeof autoRoleGrants>;
export type NewAutoRoleGrant = InferInsertModel<typeof autoRoleGrants>;

export type AutoRoleReactionTally = InferSelectModel<
  typeof autoRoleReactionTallies
>;
export type NewAutoRoleReactionTally = InferInsertModel<
  typeof autoRoleReactionTallies
>;
