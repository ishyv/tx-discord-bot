/**
 * Zod schema for persisted user documents.
 * Purpose: single source of truth for user shape, defaults, and runtime validation for repo reads/writes.
 */
import { z } from "zod";

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
  rep: z.number().int().nonnegative().catch(0),
  warns: z.array(WarnSchema).catch(() => []),
  sanction_history: z.record(z.string(), z.array(SanctionHistoryEntrySchema)).catch(() => ({})),
  openTickets: z.array(z.string()).catch(() => []),
  currency: z.record(z.string(), z.unknown()).catch(() => ({})),
  inventory: z.record(z.string(), z.unknown()).catch(() => ({})),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type Warn = z.infer<typeof WarnSchema>;
export type User = z.infer<typeof UserSchema>;

