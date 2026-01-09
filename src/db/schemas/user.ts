/**
 * Zod schema for persisted user documents.
 * Purpose: single source of truth for user shape, defaults, and runtime validation for repo reads/writes.
 */
import { z } from "zod";

export const WarnSchema = z.object({
  reason: z.string().default(""),
  warn_id: z.string(),
  moderator: z.string(),
  timestamp: z.string(),
});

export const SanctionType = z.enum(["BAN", "KICK", "TIMEOUT", "WARN"]);
export type SanctionType = z.infer<typeof SanctionType>;

export const SanctionHistoryEntrySchema = z.object({
  type: SanctionType,
  description: z.string(),
  date: z.string().optional().default(() => new Date().toISOString()),
});
export type SanctionHistoryEntry = z.infer<typeof SanctionHistoryEntrySchema>;

export const UserSchema = z.object({
  _id: z.string(),
  rep: z.number().int().nonnegative().default(0),
  warns: z.array(WarnSchema).default(() => []),
  sanction_history: z.record(z.string(), z.array(SanctionHistoryEntrySchema)).default(() => ({})),
  openTickets: z.array(z.string()).default(() => []),
  currency: z.record(z.string(), z.unknown()).default(() => ({})),
  inventory: z.record(z.string(), z.unknown()).default(() => ({})),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type Warn = z.infer<typeof WarnSchema>;
export type User = z.infer<typeof UserSchema>;
