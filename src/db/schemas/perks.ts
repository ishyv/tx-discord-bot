/**
 * Zod schema for user perk state (per guild).
 *
 * Purpose: store perk levels per guild in user documents.
 */
import { z } from "zod";

export const PerkLevelsSchema = z
  .record(z.string(), z.number().int().min(0))
  .catch(() => ({}));

export const PerkStateSchema = z.object({
  levels: PerkLevelsSchema,
  updatedAt: z.date().catch(() => new Date()),
});

export type PerkStateData = z.infer<typeof PerkStateSchema>;
