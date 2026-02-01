/**
 * Item Mutation Validation Utilities.
 *
 * Security-focused validation for item operations.
 */

import {
  getItemDefinition,
  type ItemDefinitionWithUse,
} from "@/modules/inventory/items";
import type { ItemId } from "@/modules/inventory/definitions";

/** Safe item ID pattern: alphanumeric, hyphen, underscore only. */
const SAFE_ITEM_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Characters that are dangerous in MongoDB field paths. */
const DANGEROUS_CHARS = [".", "$"];

/**
 * Validate and sanitize item ID.
 * Returns canonical item ID if valid, null if invalid.
 */
export function sanitizeItemId(rawId: string): ItemId | null {
  for (const char of DANGEROUS_CHARS) {
    if (rawId.includes(char)) {
      return null;
    }
  }

  if (!SAFE_ITEM_ID_PATTERN.test(rawId)) {
    return null;
  }

  const item = getItemDefinition(rawId);
  if (!item) {
    return null;
  }

  return item.id as ItemId;
}

/**
 * Validate item ID with detailed error information.
 */
export function validateItemIdDetailed(
  rawId: string,
):
  | { valid: true; canonicalId: ItemId; definition: ItemDefinitionWithUse }
  | { valid: false; reason: string } {
  if (!rawId || typeof rawId !== "string") {
    return { valid: false, reason: "Item ID is required" };
  }

  for (const char of DANGEROUS_CHARS) {
    if (rawId.includes(char)) {
      return {
        valid: false,
        reason: `Item ID cannot contain '${char}' character`,
      };
    }
  }

  if (!SAFE_ITEM_ID_PATTERN.test(rawId)) {
    return {
      valid: false,
      reason:
        "Item ID can only contain letters, numbers, hyphens, and underscores",
    };
  }

  const item = getItemDefinition(rawId);
  if (!item) {
    return { valid: false, reason: `Item '${rawId}' is not registered` };
  }

  return { valid: true, canonicalId: item.id as ItemId, definition: item };
}
