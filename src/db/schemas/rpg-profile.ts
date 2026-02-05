/**
 * Zod schema for RpgProfile subdocument.
 *
 * Purpose: Runtime validation and default values for RPG profile data.
 * Encaje: Imported by UserSchema and repository layer.
 * Dependencies: Zod for validation.
 * Invariants:
 * - All dates default to new Date() if missing/invalid.
 * - hpCurrent defaults to 100.
 * - wins/losses default to 0.
 * - isFighting defaults to false.
 * - loadout slots default to null (empty).
 */

import { z } from "zod";

/** Equipment slot types. */
export const EquipmentSlotSchema = z.enum([
  "weapon",
  "shield",
  "helmet",
  "chest",
  "pants",
  "boots",
  "ring",
  "necklace",
]);

export type EquipmentSlot = z.infer<typeof EquipmentSlotSchema>;

/** Equipped item schema (instance-based). */
export const EquippedItemSchema = z.object({
  instanceId: z.string(),
  itemId: z.string(),
  durability: z.number(),
});

export type EquippedItem = z.infer<typeof EquippedItemSchema>;

/** Equipment loadout schema. */
export const LoadoutSchema = z.object({
  weapon: z.union([z.string(), EquippedItemSchema]).nullable().catch(null),
  shield: z.union([z.string(), EquippedItemSchema]).nullable().catch(null),
  helmet: z.union([z.string(), EquippedItemSchema]).nullable().catch(null),
  chest: z.union([z.string(), EquippedItemSchema]).nullable().catch(null),
  pants: z.union([z.string(), EquippedItemSchema]).nullable().catch(null),
  boots: z.union([z.string(), EquippedItemSchema]).nullable().catch(null),
  ring: z.union([z.string(), EquippedItemSchema]).nullable().catch(null),
  necklace: z.union([z.string(), EquippedItemSchema]).nullable().catch(null),
});

/** Type for equipment loadout. */
export type Loadout = z.infer<typeof LoadoutSchema>;

/** Default empty loadout. */
export function defaultLoadout(): Loadout {
  return {
    weapon: null,
    shield: null,
    helmet: null,
    chest: null,
    pants: null,
    boots: null,
    ring: null,
    necklace: null,
  };
}

// Coerce dates from strings/numbers; default to now if invalid
const DateSchema = z.coerce.date().catch(() => new Date());

/** Main RPG Profile schema. */
export const RpgProfileSchema = z.object({
  // Equipment loadout (8 slots)
  loadout: LoadoutSchema.catch(defaultLoadout),

  // Combat stats
  hpCurrent: z.number().int().min(0).catch(100),
  wins: z.number().int().min(0).catch(0),
  losses: z.number().int().min(0).catch(0),

  // Combat state
  isFighting: z.boolean().catch(false),
  activeFightId: z.string().nullable().catch(null),

  // Metadata
  createdAt: DateSchema,
  updatedAt: DateSchema,
  version: z.number().int().nonnegative().catch(0),
});

/** Type for RPG profile data as stored in DB. */
export type RpgProfileData = z.infer<typeof RpgProfileSchema>;

/** Partial type for updates. */
export type RpgProfilePatch = Partial<RpgProfileData>;

/**
 * Safely parse RPG profile data with full defaults.
 * Returns null if input is null/undefined.
 */
export function parseRpgProfile(data: unknown): RpgProfileData | null {
  if (!data) return null;
  const parsed = RpgProfileSchema.safeParse(data);
  if (parsed.success) return parsed.data;
  // If parsing fails entirely, return default structure
  return RpgProfileSchema.parse({});
}

/**
 * Check if RPG profile data is corrupted (missing critical fields).
 * Returns list of corrupted field paths.
 */
export function detectCorruption(data: unknown): string[] {
  const corrupted: string[] = [];
  if (!data || typeof data !== "object") {
    return ["root"];
  }

  const d = data as Record<string, unknown>;

  // Check loadout exists and has required slots
  if (!d.loadout || typeof d.loadout !== "object") {
    corrupted.push("loadout");
  } else {
    const requiredSlots = [
      "weapon",
      "shield",
      "helmet",
      "chest",
      "pants",
      "boots",
      "ring",
      "necklace",
    ];
    for (const slot of requiredSlots) {
      if (!(slot in (d.loadout as Record<string, unknown>))) {
        corrupted.push(`loadout.${slot}`);
      }
    }
  }

  // Check numeric fields
  const numericFields = ["hpCurrent", "wins", "losses", "version"] as const;
  for (const field of numericFields) {
    const value = d[field];
    if (
      typeof value !== "number" ||
      Number.isNaN(value) ||
      !Number.isInteger(value) ||
      value < 0
    ) {
      corrupted.push(field);
    }
  }

  // Check isFighting is boolean
  if (typeof d.isFighting !== "boolean") {
    corrupted.push("isFighting");
  }

  // Check dates
  const dateFields = ["createdAt", "updatedAt"] as const;
  for (const field of dateFields) {
    const value = d[field];
    if (value instanceof Date) continue;
    if (typeof value === "string") {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        corrupted.push(field);
      }
    } else if (typeof value === "number") {
      if (value < 0 || value > 8640000000000000) {
        corrupted.push(field);
      }
    } else {
      corrupted.push(field);
    }
  }

  return corrupted;
}

/**
 * Repair corrupted RPG profile data by applying defaults to invalid fields.
 */
export function repairRpgProfile(data: unknown): RpgProfileData {
  const corrupted = detectCorruption(data);

  // Start with defaults
  const now = new Date();
  const repaired: RpgProfileData = {
    loadout: defaultLoadout(),
    hpCurrent: 100,
    wins: 0,
    losses: 0,
    isFighting: false,
    activeFightId: null,
    createdAt: now,
    updatedAt: now,
    version: 0,
  };

  if (!data || typeof data !== "object") {
    return repaired;
  }

  const d = data as Record<string, unknown>;

  // Apply loadout if valid
  if (!corrupted.includes("loadout") && d.loadout) {
    const loadout = d.loadout as Record<string, unknown>;
    const slots = [
      "weapon",
      "shield",
      "helmet",
      "chest",
      "pants",
      "boots",
      "ring",
      "necklace",
    ] as const;
    for (const slot of slots) {
      const value = loadout[slot];
      if (value === null) {
        (repaired.loadout as any)[slot] = null;
      } else if (typeof value === "string") {
        (repaired.loadout as any)[slot] = value;
      } else if (typeof value === "object" && "instanceId" in value!) {
        (repaired.loadout as any)[slot] = value;
      }
    }
  }

  // Apply numeric fields if valid
  for (const field of ["hpCurrent", "wins", "losses", "version"] as const) {
    if (!corrupted.includes(field)) {
      const value = d[field];
      if (typeof value === "number" && !Number.isNaN(value)) {
        (repaired as unknown as Record<string, number>)[field] = Math.max(
          0,
          Math.trunc(value),
        );
      }
    }
  }

  // Apply isFighting if valid
  if (!corrupted.includes("isFighting") && typeof d.isFighting === "boolean") {
    repaired.isFighting = d.isFighting;
  }

  // Apply activeFightId if valid
  if (
    d.activeFightId === null ||
    (typeof d.activeFightId === "string" && d.activeFightId.length > 0)
  ) {
    repaired.activeFightId = d.activeFightId ?? null;
  }

  // Apply dates if valid
  for (const field of ["createdAt", "updatedAt"] as const) {
    if (!corrupted.includes(field)) {
      const value = d[field];
      if (value instanceof Date) {
        (repaired as unknown as Record<string, Date>)[field] = value;
      } else if (typeof value === "string" || typeof value === "number") {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
          (repaired as unknown as Record<string, Date>)[field] = date;
        }
      }
    }
  }

  return repaired;
}
