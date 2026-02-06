/**
 * Perk definitions registry.
 *
 * Purpose: provide built-in perk definitions and cost curves.
 */

import type { PerkDefinition } from "./types";

const costCurve =
  (base: number, growth: number, currencyId = "coins", minLevel?: number) =>
  (nextLevel: number) => ({
    currencyId,
    amount: Math.max(
      0,
      Math.round(base * Math.pow(growth, Math.max(0, nextLevel - 1))),
    ),
    minLevel,
  });

export const PERK_DEFINITIONS: PerkDefinition[] = [
  {
    id: "weight_boost",
    name: "💪 Extra Weight",
    description: "Increases your inventory weight capacity.",
    maxLevel: 10,
    effects: [{ type: "weight_cap", value: 20 }],
    cost: costCurve(400, 1.35, "coins"),
  },
  {
    id: "slot_boost",
    name: "🧳 More slots",
    description: "Increases the maximum inventory slot count.",
    maxLevel: 6,
    effects: [{ type: "slot_cap", value: 2 }],
    cost: costCurve(650, 1.45, "coins"),
  },
  {
    id: "work_focus",
    name: "🛠️ Work Experience",
    description: "Increases /work payout.",
    maxLevel: 5,
    effects: [{ type: "work_bonus_pct", value: 0.05 }],
    cost: costCurve(900, 1.5, "coins", 2),
  },
  {
    id: "daily_bonus_cap",
    name: "🎁 Extended Streak",
    description: "Increases the daily streak bonus cap.",
    maxLevel: 5,
    effects: [{ type: "daily_bonus_cap", value: 1 }],
    cost: costCurve(500, 1.4, "coins", 3),
  },
];



