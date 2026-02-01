/**
 * Zod schema for progression data stored per guild in user documents.
 *
 * Purpose: Validate and normalize XP + level tracking with defaults.
 */

import { z } from "zod";

const DateSchema = z.coerce.date().catch(() => new Date());

export const ProgressionCooldownsSchema = z
  .record(z.string(), DateSchema)
  .catch(() => ({}));

export const ProgressionStateSchema = z.object({
  totalXP: z.number().int().nonnegative().catch(0),
  level: z.number().int().min(1).max(12).catch(1),
  updatedAt: DateSchema,
  cooldowns: ProgressionCooldownsSchema,
});

export type ProgressionStateData = z.infer<typeof ProgressionStateSchema>;
