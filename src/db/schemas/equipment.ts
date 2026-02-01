/**
 * Equipment State Schema.
 *
 * Purpose: Store equipment loadout per guild on user documents.
 */

import { z } from "zod";

export const EquippedItemSchema = z.object({
  itemId: z.string(),
  equippedAt: z
    .string()
    .datetime()
    .catch(() => new Date().toISOString()),
});

export const EquipmentStateSchema = z.object({
  slots: z.record(z.string(), EquippedItemSchema).catch(() => ({})),
  updatedAt: z
    .string()
    .datetime()
    .catch(() => new Date().toISOString()),
});

export type EquippedItemData = z.infer<typeof EquippedItemSchema>;
export type EquipmentStateData = z.infer<typeof EquipmentStateSchema>;
