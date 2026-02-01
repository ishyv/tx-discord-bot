/**
 * Contracts between database rows, runtime caches, and the command surface for Autorole.
 */
import type {
  AutoRoleGrantRow,
  AutoRoleTallyRow as AutoRoleReactionTally,
  AutoRoleRuleRow,
  AutoRoleTriggerRow as AutoRoleTriggerSchema,
} from "./schema";

export const AUTO_ROLE_TRIGGER_TYPES = [
  "MESSAGE_REACT_ANY",
  "REACT_SPECIFIC",
  "REACTED_THRESHOLD",
  "REPUTATION_THRESHOLD",
  "ANTIQUITY_THRESHOLD",
  "MESSAGE_CONTAINS",
] as const;
export const AUTO_ROLE_GRANT_TYPES = ["LIVE", "TIMED"] as const;

export type AutoRoleTriggerType = (typeof AUTO_ROLE_TRIGGER_TYPES)[number];
export type AutoRoleGrantType = (typeof AUTO_ROLE_GRANT_TYPES)[number];

export type AutoRoleTrigger = AutoRoleTriggerSchema;

export type MessageReactAnyTrigger = Extract<
  AutoRoleTriggerSchema,
  { type: "MESSAGE_REACT_ANY" }
>;
export type ReactSpecificTrigger = Extract<
  AutoRoleTriggerSchema,
  { type: "REACT_SPECIFIC" }
>;
export type ReactedThresholdTrigger = Extract<
  AutoRoleTriggerSchema,
  { type: "REACTED_THRESHOLD" }
>;
export type ReputationThresholdTrigger = Extract<
  AutoRoleTriggerSchema,
  { type: "REPUTATION_THRESHOLD" }
>;
export type AntiquityThresholdTrigger = Extract<
  AutoRoleTriggerSchema,
  { type: "ANTIQUITY_THRESHOLD" }
>;

export type AutoRoleRule = AutoRoleRuleRow;

export interface CreateAutoRoleRuleInput {
  guildId: string;
  name: string;
  trigger: AutoRoleTrigger;
  roleId: string;
  durationMs: number | null;
  enabled?: boolean;
  createdBy?: string | null;
}

export interface UpdateRuleEnabledInput {
  guildId: string;
  name: string;
  enabled: boolean;
}

export interface DeleteRuleInput {
  guildId: string;
  name: string;
}

export interface ReactionPresenceKey {
  guildId: string;
  messageId: string;
  emojiKey: string;
  userId: string;
}

export type ReactionPresenceKeyString = string;

export interface ReactionTallyKey {
  guildId: string;
  messageId: string;
  emojiKey: string;
}

export type ReactionTallyKeyString = string;

export interface ReactionTallySnapshot {
  guildId: string;
  messageId: string;
  emojiKey: string;
  authorId: string;
  count: number;
  updatedAt: Date;
  createdAt?: Date;
}

export interface GuildRuleCache {
  anyReact: AutoRoleRule[];
  reactSpecific: Map<string, AutoRoleRule[]>;
  reactedByEmoji: Map<string, AutoRoleRule[]>;
  messageContains: AutoRoleRule[];
  repThresholds: AutoRoleRule[];
  antiquityThresholds: AutoRoleRule[];
}

export type AutoRoleGrantReason = AutoRoleGrantRow;

export interface GrantByRuleInput {
  guildId: string;
  userId: string;
  roleId: string;
  ruleName: string;
  type: AutoRoleGrantType;
  expiresAt: Date | null;
}

export interface RevokeByRuleInput {
  guildId: string;
  userId: string;
  roleId: string;
  ruleName: string;
  type: AutoRoleGrantType;
}

export type DbAutoRoleRule = AutoRoleRuleRow;
export type DbAutoRoleGrant = AutoRoleGrantRow;
export type DbAutoRoleReactionTally = AutoRoleReactionTally;
