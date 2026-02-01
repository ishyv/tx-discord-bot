/**
 * Zod schema for persisted user documents.
 * Purpose: single source of truth for user shape, defaults, and runtime validation for repo reads/writes.
 */
import { z } from "zod";
import type { CurrencyInventory } from "@/modules/economy/currency";
import type { ItemInventory } from "@/modules/inventory/inventory";
import {
  EconomyAccountSchema,
  type EconomyAccountData,
} from "./economy-account";
import {
  ProgressionStateSchema,
  type ProgressionStateData,
} from "./progression";
import { PerkStateSchema, type PerkStateData } from "./perks";
import { EquipmentStateSchema, type EquipmentStateData } from "./equipment";

export const WarnSchema = z.object({
  reason: z.string().catch(""),
  warn_id: z.string(),
  moderator: z.string(),
  timestamp: z.string(),
});

export const SanctionType = z.enum(["BAN", "KICK", "TIMEOUT", "WARN"]);
export type SanctionType = z.infer<typeof SanctionType>;

export const SanctionHistoryEntrySchema = z.object({
  type: SanctionType,
  description: z.string(),
  date: z
    .string()
    .optional()
    .catch(() => new Date().toISOString()),
});
export type SanctionHistoryEntry = z.infer<typeof SanctionHistoryEntrySchema>;

export const UserSchema = z.object({
  _id: z.string(),
  // Legacy reputation field (moved to currency.rep).
  rep: z.number().int().nonnegative().catch(0).optional(),
  warns: z.array(WarnSchema).catch(() => []),
  sanction_history: z
    .record(z.string(), z.array(SanctionHistoryEntrySchema))
    .catch(() => ({})),
  openTickets: z.array(z.string()).catch(() => []),
  currency: z
    .record(z.string(), z.unknown())
    .catch(() => ({})) as z.ZodType<CurrencyInventory>,
  inventory: z
    .record(z.string(), z.unknown())
    .catch(() => ({})) as z.ZodType<ItemInventory>,
  progression: z
    .record(z.string(), ProgressionStateSchema)
    .catch(() => ({})) as z.ZodType<Record<string, ProgressionStateData>>,
  perks: z.record(z.string(), PerkStateSchema).catch(() => ({})) as z.ZodType<
    Record<string, PerkStateData>
  >,
  equipment: z
    .record(z.string(), EquipmentStateSchema)
    .catch(() => ({})) as z.ZodType<Record<string, EquipmentStateData>>,
  // If economyAccount fails parsing, repair it instead of erasing (data-loss prevention)
  economyAccount: EconomyAccountSchema.optional().catch((ctx) => {
    // Repair: parse the input with defaults instead of returning undefined
    const input =
      typeof ctx.input === "object" && ctx.input !== null ? ctx.input : {};
    return EconomyAccountSchema.parse(input);
  }) as z.ZodType<EconomyAccountData | undefined>,
  // Minigames state (cooldowns, daily limits)
  minigames: z
    .record(z.string(), z.unknown())
    .optional()
    .catch(() => ({})),
  // Voting stats per guild
  votingStats: z
    .record(z.string(), z.unknown())
    .optional()
    .catch(() => ({})),
  // Voting aggregates per guild
  voteAggregates: z
    .record(z.string(), z.unknown())
    .optional()
    .catch(() => ({})),
  // Voting preferences
  votingPrefs: z
    .object({
      optOut: z.boolean().optional(),
      showVotes: z.boolean().optional(),
      updatedAt: z.date().optional(),
    })
    .optional()
    .catch(() => ({})),
});

export type Warn = z.infer<typeof WarnSchema>;
export type User = z.infer<typeof UserSchema>;
export type { EquipmentStateData } from "./equipment";
