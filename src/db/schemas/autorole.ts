/**
 * Zod schemas for autorole domain (rules, grants, tallies).
 * Purpose: define persisted shapes and discriminated triggers as the single source of truth.
 */
import { z } from "zod";

const TriggerReactAny = z.object({
  type: z.literal("MESSAGE_REACT_ANY"),
  args: z.object({}).catch({}),
});

const TriggerReactSpecific = z.object({
  type: z.literal("REACT_SPECIFIC"),
  args: z.object({
    messageId: z.string(),
    emojiKey: z.string(),
  }),
});

const TriggerMessageContains = z.object({
  type: z.literal("MESSAGE_CONTAINS"),
  args: z.object({
    keywords: z.array(z.string()),
  }),
});

const TriggerReactedThreshold = z.object({
  type: z.literal("REACTED_THRESHOLD"),
  args: z.object({
    emojiKey: z.string(),
    count: z.number().int(),
  }),
});

const TriggerReputationThreshold = z.object({
  type: z.literal("REPUTATION_THRESHOLD"),
  args: z.object({
    minRep: z.number().int(),
  }),
});

const TriggerAntiquityThreshold = z.object({
  type: z.literal("ANTIQUITY_THRESHOLD"),
  args: z.object({
    durationMs: z.number().int(),
  }),
});

export const AutoRoleTriggerSchema = z.discriminatedUnion("type", [
  TriggerReactAny,
  TriggerReactSpecific,
  TriggerMessageContains,
  TriggerReactedThreshold,
  TriggerReputationThreshold,
  TriggerAntiquityThreshold,
]);

export const AutoRoleRuleSchema = z.object({
  _id: z.string(),
  id: z.string(),
  guildId: z.string(),
  name: z.string(),
  roleId: z.string(),
  trigger: AutoRoleTriggerSchema,
  durationMs: z.number().int().nullable().catch(null),
  enabled: z.boolean().catch(true),
  createdBy: z.string().nullable().catch(null),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const AutoRoleGrantSchema = z.object({
  _id: z.string(),
  guildId: z.string(),
  userId: z.string(),
  roleId: z.string(),
  ruleName: z.string(),
  type: z.enum(["LIVE", "TIMED"]),
  expiresAt: z.date().nullable().catch(null),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const AutoRoleTallySchema = z.object({
  _id: z.string(),
  guildId: z.string(),
  messageId: z.string(),
  emojiKey: z.string(),
  authorId: z.string().catch(""),
  count: z.number().int().nonnegative().catch(0),
  createdAt: z.date().optional().catch(() => new Date()),
  updatedAt: z.date().optional(),
});

export type AutoRoleTrigger = z.infer<typeof AutoRoleTriggerSchema>;
export type AutoRoleRule = z.infer<typeof AutoRoleRuleSchema>;
export type AutoRoleGrant = z.infer<typeof AutoRoleGrantSchema>;
export type AutoRoleTally = z.infer<typeof AutoRoleTallySchema>;

