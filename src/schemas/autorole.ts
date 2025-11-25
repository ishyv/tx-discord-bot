/**
 * Motivación: definir el contrato de datos autorole para asegurar que el resto del código consuma estructuras consistentes.
 *
 * Idea/concepto: usa tipos/interfaces para describir campos esperados y su intención en el dominio.
 *
 * Alcance: solo declara formas de datos; no valida en tiempo de ejecución ni persiste información.
 */
/**
 * Autorole schema (type-only). These definitions mirror the persisted shapes
 * used by the Mongo repositories so business logic can stay typed without
 * depending on Postgres/Drizzle.
 */

export const autoRoleTriggerType = {
  enumValues: [
    "MESSAGE_REACT_ANY",
    "REACT_SPECIFIC",
    "REACTED_THRESHOLD",
    "REPUTATION_THRESHOLD",
    "ANTIQUITY_THRESHOLD",
  ] as const,
};

export const roleGrantType = {
  enumValues: ["LIVE", "TIMED"] as const,
};

export type AutoRoleTriggerType = (typeof autoRoleTriggerType.enumValues)[number];
export type AutoRoleGrantType = (typeof roleGrantType.enumValues)[number];

export type AutoRoleRuleArgs =
  | { type: "MESSAGE_REACT_ANY"; args: Record<string, never> }
  | { type: "REACT_SPECIFIC"; args: { messageId: string; emojiKey: string } }
  | { type: "REACTED_THRESHOLD"; args: { emojiKey: string; count: number } }
  | { type: "REPUTATION_THRESHOLD"; args: { minRep: number } }
  | { type: "ANTIQUITY_THRESHOLD"; args: { durationMs: number } };

export interface AutoRoleRule {
  guildId: string;
  name: string;
  triggerType: AutoRoleTriggerType;
  args: AutoRoleRuleArgs["args"];
  roleId: string;
  durationMs: number | null;
  enabled: boolean;
  createdBy: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AutoRoleGrant {
  guildId: string;
  userId: string;
  roleId: string;
  ruleName: string;
  type: AutoRoleGrantType;
  expiresAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AutoRoleReactionTally {
  guildId: string;
  messageId: string;
  emojiKey: string;
  authorId: string;
  count: number;
  updatedAt?: Date;
}
