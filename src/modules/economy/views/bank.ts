/**
 * Bank Breakdown View Builder.
 *
 * Purpose: Calculate and format bank/hand distribution for coin currency.
 * Encaje: Pure function transforming CoinValue to display-ready view.
 * Dependencies: None (pure computation).
 *
 * Invariants:
 * - Percentages always sum to 100 (within floating point tolerance).
 * - Empty state (0 total) is explicitly marked.
 * - All calculations use integers for coins.
 */

import type { CurrencyInventory } from "../currency";
import { type BankBreakdownView, EMPTY_BANK_BREAKDOWN } from "../account/types";

/** Coin value shape in inventory. */
interface CoinValue {
  hand: number;
  bank: number;
}

/** Extract coins from inventory, returning null if missing/invalid. */
function extractCoins(inventory: CurrencyInventory): CoinValue | null {
  const raw = inventory.coins;
  if (!raw || typeof raw !== "object") return null;

  const c = raw as Record<string, unknown>;
  const hand = typeof c.hand === "number" ? Math.trunc(c.hand) : 0;
  const bank = typeof c.bank === "number" ? Math.trunc(c.bank) : 0;

  return { hand, bank };
}

/**
 * Build bank breakdown view from currency inventory.
 * Returns null if coins currency is not present.
 */
export function buildBankBreakdown(
  inventory: CurrencyInventory,
): BankBreakdownView | null {
  const coins = extractCoins(inventory);
  if (!coins) return null;

  const total = coins.hand + coins.bank;

  if (total === 0) {
    return {
      ...EMPTY_BANK_BREAKDOWN,
      isEmpty: true,
    };
  }

  const percentInBank = (coins.bank / total) * 100;
  const percentInHand = 100 - percentInBank;

  return {
    hand: coins.hand,
    bank: coins.bank,
    total,
    percentInBank,
    percentInHand,
    isEmpty: false,
  };
}

/**
 * Get safety rating based on bank percentage.
 * Returns a user-friendly rating string.
 */
export function getBankSafetyRating(percentInBank: number): {
  rating: string;
  emoji: string;
  advice: string;
} {
  if (percentInBank >= 80) {
    return {
      rating: "Very Secure",
      emoji: "🔒",
      advice: "Excellent! Most of your coins are protected.",
    };
  }
  if (percentInBank >= 50) {
    return {
      rating: "Secure",
      emoji: "🛡️",
      advice: "Good balance. Consider saving more in the bank.",
    };
  }
  if (percentInBank >= 20) {
    return {
      rating: "Moderate",
      emoji: "⚠️",
      advice: "You could lose coins in events. Deposit more in the bank.",
    };
  }
  return {
    rating: "Risky",
    emoji: "🚨",
    advice: "Watch out! Your coins are at risk. Use /deposit now.",
  };
}
