/**
 * Upgrade Definitions.
 *
 * Purpose: Define upgrade paths and requirements.
 * Context: Tool tier progression.
 */

import { UPGRADE_CONFIG } from "../config";
import type { UpgradeRequirement, UpgradeInfo } from "./types";

/** Get upgrade cost for a tier. */
export function getUpgradeCost(tier: number): UpgradeRequirement | null {
  return UPGRADE_CONFIG.costs[tier] ?? null;
}

/** Get next tier for a tool. */
export function getNextTier(currentTier: number): number {
  return Math.min(UPGRADE_CONFIG.maxTier, currentTier + 1);
}

/** Check if tool can be upgraded further. */
export function canUpgradeTier(currentTier: number): boolean {
  return currentTier < UPGRADE_CONFIG.maxTier;
}

/** Parse tier from tool ID. */
export function parseToolTier(toolId: string): number {
  const match = toolId.match(/(?:lv\.?|level|_|\s)(\d)/i);
  if (match) {
    return parseInt(match[1]!, 10);
  }
  return 1;
}

/** Generate upgraded tool ID. */
export function generateUpgradedToolId(originalId: string, newTier: number): string {
  // Try to replace existing tier pattern
  const patterns = [
    /(_lv\.?(\d))/i,
    /(_level(\d))/i,
    /(_(\d))/,
    /(\s(\d))$/,
  ];

  for (const pattern of patterns) {
    if (pattern.test(originalId)) {
      return originalId.replace(pattern, `_lv${newTier}`);
    }
  }

  // No pattern found, append tier
  return `${originalId}_lv${newTier}`;
}

/** Get base tool name. */
export function getBaseToolName(toolId: string): string {
  // Remove tier suffixes
  return toolId
    .replace(/_lv\.?\d/i, "")
    .replace(/_level\d/i, "")
    .replace(/_\d$/, "")
    .replace(/\s\d$/, "")
    .trim();
}

/** Check if user has higher tier version. */
export function hasHigherTier(
  inventory: Record<string, { qty: number } | undefined>,
  baseToolName: string,
  currentTier: number,
): boolean {
  for (let tier = currentTier + 1; tier <= UPGRADE_CONFIG.maxTier; tier++) {
    const toolId = `${baseToolName}_lv${tier}`;
    const item = inventory[toolId];
    if (item && item.qty > 0) {
      return true;
    }
  }
  return false;
}

/** Get upgrade info for a tool. */
export function getUpgradeInfo(
  toolId: string,
  inventory: Record<string, { qty: number } | undefined>,
  coins: number,
): UpgradeInfo {
  const currentTier = parseToolTier(toolId);
  const baseName = getBaseToolName(toolId);

  if (!canUpgradeTier(currentTier)) {
    return {
      canUpgrade: false,
      reason: "Tool is already at maximum tier",
      nextTier: currentTier,
      requirements: { tier: currentTier, money: 0, materials: [] },
    };
  }

  if (hasHigherTier(inventory, baseName, currentTier)) {
    return {
      canUpgrade: false,
      reason: "You already own a higher tier version",
      nextTier: currentTier,
      requirements: { tier: currentTier, money: 0, materials: [] },
    };
  }

  const nextTier = getNextTier(currentTier);
  const requirements = getUpgradeCost(nextTier);

  if (!requirements) {
    return {
      canUpgrade: false,
      reason: "Upgrade requirements not defined",
      nextTier: currentTier,
      requirements: { tier: currentTier, money: 0, materials: [] },
    };
  }

  // Check money
  if (coins < requirements.money) {
    return {
      canUpgrade: false,
      reason: `Insufficient funds (need ${requirements.money} coins)`,
      nextTier,
      requirements,
    };
  }

  // Check materials
  for (const material of requirements.materials) {
    const hasQty = inventory[material.id]?.qty ?? 0;
    if (hasQty < material.qty) {
      return {
        canUpgrade: false,
        reason: `Insufficient ${material.id} (need ${material.qty}, have ${hasQty})`,
        nextTier,
        requirements,
      };
    }
  }

  return {
    canUpgrade: true,
    nextTier,
    requirements,
  };
}
