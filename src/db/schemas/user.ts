/**
 * Zod schema for persisted user documents.
 * Purpose: single source of truth for user shape, defaults, and runtime validation for repo reads/writes.
 */
import { z } from "zod";
import type { CurrencyInventory } from "@/modules/economy/currency";
import type { ItemInventory } from "@/modules/inventory/inventory";

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
  date: z.string().optional().catch(() => new Date().toISOString()),
});
export type SanctionHistoryEntry = z.infer<typeof SanctionHistoryEntrySchema>;

export const UserSchema = z.object({
  _id: z.string(),
  // Legacy reputation field (moved to currency.rep).
  rep: z.number().int().nonnegative().catch(0).optional(),
  warns: z.array(WarnSchema).catch(() => []),
  sanction_history: z.record(z.string(), z.array(SanctionHistoryEntrySchema)).catch(() => ({})),
  openTickets: z.array(z.string()).catch(() => []),
  currency: z
    .record(z.string(), z.unknown())
    .catch(() => ({})) as z.ZodType<CurrencyInventory>,
  inventory: z
    .record(z.string(), z.unknown())
    .catch(() => ({})) as z.ZodType<ItemInventory>,
});

export type Warn = z.infer<typeof WarnSchema>;
export type User = z.infer<typeof UserSchema>;

