import { z } from "zod";
import {
  CONTENT_ID_REGEX,
  ContentIdSchema,
  ProfessionSchema,
} from "@/modules/content/schemas";
import type { QuestDef, QuestlineDef } from "./types";

const IdSchema = z
  .string()
  .regex(CONTENT_ID_REGEX, "Expected pattern ^[a-z0-9_]+$");

const PositiveInt = z.number().int().min(1);

const QuestDifficultySchema = z.enum([
  "easy",
  "medium",
  "hard",
  "expert",
  "legendary",
]);

const RepeatSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({ kind: z.literal("daily") }).strict(),
  z.object({ kind: z.literal("weekly") }).strict(),
  z.object({ kind: z.literal("cooldown"), hours: PositiveInt }).strict(),
]);

const QuestPrerequisitesSchema = z
  .object({
    profession: ProfessionSchema.optional(),
    minLevel: PositiveInt.optional(),
    requiresQuestsCompleted: z.array(IdSchema).default([]),
  })
  .strict();

const GatherStepSchema = z
  .object({
    kind: z.literal("gather_item"),
    action: z.enum(["mine", "forest"]),
    itemId: ContentIdSchema,
    qty: PositiveInt,
    locationTierMin: PositiveInt.max(4).optional(),
    locationTierMax: PositiveInt.max(4).optional(),
    toolTierMin: PositiveInt.max(4).optional(),
  })
  .strict()
  .superRefine((step, ctx) => {
    if (
      step.locationTierMin !== undefined &&
      step.locationTierMax !== undefined &&
      step.locationTierMax < step.locationTierMin
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "locationTierMax must be greater than or equal to locationTierMin",
        path: ["locationTierMax"],
      });
    }
  });

const ProcessStepSchema = z
  .object({
    kind: z.literal("process_item"),
    inputItemId: ContentIdSchema,
    outputItemId: ContentIdSchema.optional(),
    qty: PositiveInt,
    successOnly: z.boolean().default(true),
  })
  .strict();

const CraftStepSchema = z
  .object({
    kind: z.literal("craft_recipe"),
    recipeId: ContentIdSchema,
    qty: PositiveInt,
  })
  .strict();

const MarketListStepSchema = z
  .object({
    kind: z.literal("market_list_item"),
    itemId: ContentIdSchema,
    qty: PositiveInt,
  })
  .strict();

const MarketBuyStepSchema = z
  .object({
    kind: z.literal("market_buy_item"),
    itemId: ContentIdSchema,
    qty: PositiveInt,
  })
  .strict();

const FightWinStepSchema = z
  .object({
    kind: z.literal("fight_win"),
    qty: PositiveInt,
  })
  .strict();

export const QuestStepSchema = z.discriminatedUnion("kind", [
  GatherStepSchema,
  ProcessStepSchema,
  CraftStepSchema,
  MarketListStepSchema,
  MarketBuyStepSchema,
  FightWinStepSchema,
]);

export const QuestRewardsSchema = z
  .object({
    currency: z
      .array(
        z
          .object({
            id: ContentIdSchema,
            amount: PositiveInt,
          })
          .strict(),
      )
      .optional(),
    xp: z.number().int().min(0).optional(),
    items: z
      .array(
        z
          .object({
            itemId: ContentIdSchema,
            qty: PositiveInt,
          })
          .strict(),
      )
      .optional(),
    tokens: z.number().int().min(0).optional(),
  })
  .strict()
  .superRefine((rewards, ctx) => {
    const hasAny =
      (rewards.currency?.length ?? 0) > 0 ||
      (rewards.items?.length ?? 0) > 0 ||
      (rewards.xp ?? 0) > 0 ||
      (rewards.tokens ?? 0) > 0;

    if (!hasAny) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Quest rewards must include at least one non-zero reward",
      });
    }
  });

export const QuestDefSchema = z
  .object({
    id: IdSchema,
    title: z.string().min(1),
    icon: z.string().min(1).max(8).optional(),
    description: z.string().min(1),
    repeat: RepeatSchema.default({ kind: "none" }),
    difficulty: QuestDifficultySchema.default("easy"),
    prerequisites: QuestPrerequisitesSchema.optional(),
    steps: z.array(QuestStepSchema).min(1),
    rewards: QuestRewardsSchema,
    enabled: z.boolean().default(true),
  })
  .strict();

export const QuestlineDefSchema = z
  .object({
    id: IdSchema,
    title: z.string().min(1),
    description: z.string().optional(),
    questIds: z.array(IdSchema).min(1),
  })
  .strict();

export const QuestPackSchema = z
  .object({
    schemaVersion: z.literal(1),
    quests: z.array(QuestDefSchema),
  })
  .strict();

export const QuestlinePackSchema = z
  .object({
    schemaVersion: z.literal(1),
    questlines: z.array(QuestlineDefSchema),
  })
  .strict();

export type ParsedQuestDef = z.infer<typeof QuestDefSchema>;
export type ParsedQuestlineDef = z.infer<typeof QuestlineDefSchema>;

export function parseQuestDef(input: unknown): QuestDef {
  return QuestDefSchema.parse(input) as QuestDef;
}

export function parseQuestlineDef(input: unknown): QuestlineDef {
  return QuestlineDefSchema.parse(input) as QuestlineDef;
}
