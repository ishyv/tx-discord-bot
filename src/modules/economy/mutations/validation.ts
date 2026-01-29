/**
 * Currency Mutation Validation Utilities.
 *
 * Purpose: Security-focused validation for currency operations.
 * Encaje: Used by CurrencyMutationService to prevent injection attacks.
 *
 * Security Rules:
 * - currencyId must not contain '.' (dot) or '$' (dollar sign)
 * - These characters can inject into MongoDB paths
 * - Only allow alphanumeric, hyphens, and underscores
 */

import { currencyRegistry } from "../currencyRegistry";
import type { CurrencyId } from "../currency";

/** Safe currency ID pattern: alphanumeric, hyphen, underscore only. */
const SAFE_CURRENCY_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Characters that are dangerous in MongoDB field paths. */
const DANGEROUS_CHARS = [".", "$"];

/**
 * Validate that a currency ID is safe to use in MongoDB paths.
 * Returns the canonical currency ID if valid, null if invalid.
 */
export function sanitizeCurrencyId(rawId: string): CurrencyId | null {
  // Check for dangerous characters
  for (const char of DANGEROUS_CHARS) {
    if (rawId.includes(char)) {
      return null;
    }
  }

  // Must match safe pattern
  if (!SAFE_CURRENCY_ID_PATTERN.test(rawId)) {
    return null;
  }

  // Must be registered in the registry
  const currency = currencyRegistry.get(rawId);
  if (!currency) {
    return null;
  }

  // Return the registry's canonical ID (defense in depth)
  return currency.id as CurrencyId;
}

/**
 * Check if a string could be a valid currency ID format.
 * This is a lightweight check for UI validation before hitting the registry.
 */
export function isValidCurrencyIdFormat(id: string): boolean {
  if (!id || typeof id !== "string") return false;

  for (const char of DANGEROUS_CHARS) {
    if (id.includes(char)) return false;
  }

  return SAFE_CURRENCY_ID_PATTERN.test(id);
}

/**
 * List all registered currency IDs.
 * Useful for command autocomplete or validation.
 */
export function getRegisteredCurrencyIds(): CurrencyId[] {
  return currencyRegistry.list() as CurrencyId[];
}

/**
 * Validate currency ID and return detailed error information.
 */
export function validateCurrencyIdDetailed(
  rawId: string,
): { valid: true; canonicalId: CurrencyId } | { valid: false; reason: string } {
  if (!rawId || typeof rawId !== "string") {
    return { valid: false, reason: "Currency ID is required" };
  }

  for (const char of DANGEROUS_CHARS) {
    if (rawId.includes(char)) {
      return {
        valid: false,
        reason: `Currency ID cannot contain '${char}' character`,
      };
    }
  }

  if (!SAFE_CURRENCY_ID_PATTERN.test(rawId)) {
    return {
      valid: false,
      reason: "Currency ID can only contain letters, numbers, hyphens, and underscores",
    };
  }

  const currency = currencyRegistry.get(rawId);
  if (!currency) {
    return { valid: false, reason: `Currency '${rawId}' is not registered` };
  }

  return { valid: true, canonicalId: currency.id as CurrencyId };
}
