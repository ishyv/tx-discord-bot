/**
 * Zod schema for EconomyAccount subdocument.
 *
 * Purpose: Runtime validation and default values for economy account metadata.
 * Encaje: Imported by UserSchema and repository layer.
 * Dependencies: Zod for validation.
 * Invariants:
 * - All dates default to new Date() if missing/invalid.
 * - Status defaults to 'ok'.
 * - Version defaults to 0 and increments on each update.
 */

import { z } from "zod";
import type { AccountStatus } from "@/modules/economy/account/types";

export const AccountStatusSchema: z.ZodType<AccountStatus> = z
  .enum(["ok", "blocked", "banned"])
  .catch("ok");

// Coerce dates from strings/numbers; default to now if invalid
const DateSchema = z.coerce.date().catch(() => new Date());

export const EconomyAccountSchema = z.object({
  status: AccountStatusSchema,
  createdAt: DateSchema,
  updatedAt: DateSchema,
  lastActivityAt: DateSchema,
  version: z.number().int().nonnegative().catch(0),
});

/** Type for economy account data as stored in DB. */
export type EconomyAccountData = z.infer<typeof EconomyAccountSchema>;

/** Partial type for updates. */
export type EconomyAccountPatch = Partial<EconomyAccountData>;

/**
 * Safely parse economy account data with full defaults.
 * Returns null if input is null/undefined.
 */
export function parseEconomyAccount(data: unknown): EconomyAccountData | null {
  if (!data) return null;
  const parsed = EconomyAccountSchema.safeParse(data);
  if (parsed.success) return parsed.data;
  // If parsing fails entirely, return default structure
  return EconomyAccountSchema.parse({});
}

/**
 * Check if economy account data is corrupted (missing critical fields).
 * Returns list of corrupted field paths.
 */
export function detectCorruption(data: unknown): string[] {
  const corrupted: string[] = [];
  if (!data || typeof data !== "object") {
    return ["root"];
  }

  const d = data as Record<string, unknown>;

  // Check status
  if (!["ok", "blocked", "banned"].includes(d.status as string)) {
    corrupted.push("status");
  }

  // Check dates are actually dates (or can be parsed)
  const dateFields = ["createdAt", "updatedAt", "lastActivityAt"] as const;
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
        // Valid timestamp range
        corrupted.push(field);
      }
    } else {
      corrupted.push(field);
    }
  }

  // Check version
  if (
    typeof d.version !== "number" ||
    !Number.isInteger(d.version) ||
    d.version < 0
  ) {
    corrupted.push("version");
  }

  return corrupted;
}

/**
 * Repair corrupted economy account data by applying defaults to invalid fields.
 */
export function repairEconomyAccount(data: unknown): EconomyAccountData {
  const corrupted = detectCorruption(data);

  // Start with defaults
  const repaired: EconomyAccountData = {
    status: "ok",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastActivityAt: new Date(),
    version: 0,
  };

  if (!data || typeof data !== "object") {
    return repaired;
  }

  const d = data as Record<string, unknown>;

  // Apply valid fields, use defaults for corrupted ones
  if (
    !corrupted.includes("status") &&
    ["ok", "blocked", "banned"].includes(d.status as string)
  ) {
    repaired.status = d.status as AccountStatus;
  }

  for (const field of ["createdAt", "updatedAt", "lastActivityAt"] as const) {
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

  if (!corrupted.includes("version") && typeof d.version === "number") {
    repaired.version = Math.max(0, Math.trunc(d.version));
  }

  return repaired;
}
