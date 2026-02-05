/**
 * RPG Profile Schema.
 *
 * Purpose: Zod schemas for RPG profile persistence and validation.
 * Context: Stored on user documents under `rpgProfile` field.
 */

import { z } from "zod";
import { COMBAT_CONFIG } from "../config";

/** Schema for equipment slots. */
export const EquipmentSlotsSchema = z.object({
  weapon: z.string().nullable().catch(null),
  shield: z.string().nullable().catch(null),
  helmet: z.string().nullable().catch(null),
  chest: z.string().nullable().catch(null),
  pants: z.string().nullable().catch(null),
  boots: z.string().nullable().catch(null),
  ring: z.string().nullable().catch(null),
  necklace: z.string().nullable().catch(null),
});

/** Schema for combat state. */
export const CombatStateSchema = z.object({
  currentHp: z.number().int().min(0).max(9999).catch(COMBAT_CONFIG.baseMaxHp),
  isFighting: z.boolean().catch(false),
  sessionId: z.string().nullable().catch(null),
});

/** Schema for combat record. */
export const CombatRecordSchema = z.object({
  wins: z.number().int().min(0).catch(0),
  losses: z.number().int().min(0).catch(0),
});

/** Schema for RPG profile data (stored in DB). */
export const RpgProfileDataSchema = z.object({
  equipment: EquipmentSlotsSchema.catch(() => ({
    weapon: null,
    shield: null,
    helmet: null,
    chest: null,
    pants: null,
    boots: null,
    ring: null,
    necklace: null,
  })),
  combat: CombatStateSchema.catch(() => ({
    currentHp: COMBAT_CONFIG.baseMaxHp,
    isFighting: false,
    sessionId: null,
  })),
  record: CombatRecordSchema.catch(() => ({ wins: 0, losses: 0 })),
  createdAt: z.string().datetime().catch(() => new Date().toISOString()),
  updatedAt: z.string().datetime().catch(() => new Date().toISOString()),
});

/** Type for stored RPG profile data. */
export type RpgProfileData = z.infer<typeof RpgProfileDataSchema>;

/** Default empty profile data. */
export function createDefaultProfileData(): RpgProfileData {
  const now = new Date().toISOString();
  return {
    equipment: {
      weapon: null,
      shield: null,
      helmet: null,
      chest: null,
      pants: null,
      boots: null,
      ring: null,
      necklace: null,
    },
    combat: {
      currentHp: COMBAT_CONFIG.baseMaxHp,
      isFighting: false,
      sessionId: null,
    },
    record: {
      wins: 0,
      losses: 0,
    },
    createdAt: now,
    updatedAt: now,
  };
}

/** Detect corruption in profile data. */
export function detectProfileCorruption(data: unknown): string[] {
  const issues: string[] = [];
  if (!data || typeof data !== "object") {
    return ["invalid_root"];
  }

  const d = data as Record<string, unknown>;

  // Check equipment
  if (!d.equipment || typeof d.equipment !== "object") {
    issues.push("missing_equipment");
  }

  // Check combat state
  if (!d.combat || typeof d.combat !== "object") {
    issues.push("missing_combat");
  }

  // Check record
  if (!d.record || typeof d.record !== "object") {
    issues.push("missing_record");
  }

  return issues;
}

/** Repair corrupted profile data. */
export function repairProfileData(data: unknown): RpgProfileData {
  const defaults = createDefaultProfileData();

  if (!data || typeof data !== "object") {
    return defaults;
  }

  const d = data as Record<string, unknown>;

  return {
    equipment: EquipmentSlotsSchema.catch(defaults.equipment).parse(d.equipment),
    combat: CombatStateSchema.catch(defaults.combat).parse(d.combat),
    record: CombatRecordSchema.catch(defaults.record).parse(d.record),
    createdAt: z.string().datetime().catch(defaults.createdAt).parse(d.createdAt),
    updatedAt: z.string().datetime().catch(defaults.updatedAt).parse(d.updatedAt),
  };
}
