/**
 * Motivación: aportar utilidades (types) para construir la funcionalidad de autoroles sin duplicar parseo ni validación.
 *
 * Idea/concepto: define tipos, caché y validadores que consumen los sistemas y comandos de autorole.
 *
 * Alcance: piezas de infraestructura; no programan las reglas de asignación en sí mismas.
 */
/**
 * This module codifies the shapes used by the autorole system so the rest of the
 * codebase can exchange typed data instead of loose records.  Treat it as the
 * contract between database rows, runtime caches, and the command surface.
 */

import type {
  AutoRoleGrantData as AutoRoleGrant,
  AutoRoleReactionTallyData as AutoRoleReactionTally,
  AutoRoleRuleData as AutoRoleRuleRow,
} from "@/db/models/autorole.schema";
import {
  autoRoleTriggerType,
  roleGrantType,
} from "@/db/models/autorole.schema";

export const AUTO_ROLE_TRIGGER_TYPES = autoRoleTriggerType.enumValues;
export const AUTO_ROLE_GRANT_TYPES = roleGrantType.enumValues;

export type AutoRoleTriggerType = (typeof AUTO_ROLE_TRIGGER_TYPES)[number];
export type AutoRoleGrantType = (typeof AUTO_ROLE_GRANT_TYPES)[number];

export interface MessageReactAnyTrigger {
  type: "MESSAGE_REACT_ANY";
  args: Record<string, never>;
}

export interface ReactSpecificTrigger {
  type: "REACT_SPECIFIC";
  args: {
    messageId: string;
    emojiKey: string;
  };
}

export interface ReactedThresholdTrigger {
  type: "REACTED_THRESHOLD";
  args: {
    emojiKey: string;
    count: number;
  };
}

export interface ReputationThresholdTrigger {
  type: "REPUTATION_THRESHOLD";
  args: {
    minRep: number;
  };
}

export interface AntiquityThresholdTrigger {
  type: "ANTIQUITY_THRESHOLD";
  args: {
    durationMs: number;
  };
}

export type AutoRoleTrigger =
  | MessageReactAnyTrigger
  | ReactSpecificTrigger
  | ReactedThresholdTrigger
  | ReputationThresholdTrigger
  | AntiquityThresholdTrigger;

export interface AutoRoleRule {
  guildId: string;
  name: string;
  trigger: AutoRoleTrigger;
  roleId: string;
  durationMs: number | null;
  enabled: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

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
  key: ReactionTallyKey;
  authorId: string;
  count: number;
  updatedAt: Date;
}

export interface GuildRuleCache {
  anyReact: AutoRoleRule[];
  reactSpecific: Map<string, AutoRoleRule[]>;
  reactedByEmoji: Map<string, AutoRoleRule[]>;
  repThresholds: AutoRoleRule[];
  antiquityThresholds: AutoRoleRule[];
}

export interface AutoRoleGrantReason {
  guildId: string;
  userId: string;
  roleId: string;
  ruleName: string;
  type: AutoRoleGrantType;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

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
export type DbAutoRoleGrant = AutoRoleGrant;
export type DbAutoRoleReactionTally = AutoRoleReactionTally;
