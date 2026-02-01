import { Currency } from "@/modules/economy/currency";
import { Register } from "../currencyRegistry";

export type CoinValue = {
  hand: number;
  bank: number;

  // If true, when subtracting, use the total of hand + bank to determine sufficiency
  // Meanig, if true, subtraction will first deplete hand, then bank as needed
  use_total_on_subtract: boolean;
};

declare module "@/modules/economy/currency" {
  interface CurrencyValueMap {
    coins: CoinValue;
  }
}

@Register()
export class Coins implements Currency<CoinValue> {
  readonly id = "coins";

  zero(): CoinValue {
    return { hand: 0, bank: 0, use_total_on_subtract: false };
  }

  display(value: CoinValue): string {
    const hand = Math.max(0, value.hand ?? 0);
    const bank = Math.max(0, value.bank ?? 0);
    return `${hand} coins (hand) / ${bank} coins (bank)`;
  }

  add(a: CoinValue, b: CoinValue): CoinValue {
    return {
      hand: (a.hand ?? 0) + (b.hand ?? 0),
      bank: (a.bank ?? 0) + (b.bank ?? 0),
      use_total_on_subtract: a.use_total_on_subtract || b.use_total_on_subtract,
    };
  }

  /**
   * Subtract b from a.
   * If `b.use_total_on_subtract` is `true`,
   * will consider total of hand + bank for sufficiency.
   * Hand will be depleted first, then bank as needed.
   *
   * If `b.use_total_on_subtract` is `false`,
   * will subtract hand from hand and bank from bank directly.
   */
  sub(a: CoinValue, b: CoinValue): CoinValue {
    if (b.use_total_on_subtract) {
      let total = (a.hand ?? 0) + (a.bank ?? 0);
      const subAmount = (b.hand ?? 0) + (b.bank ?? 0);
      if (subAmount > total) {
        // Signal invalid operation so the engine rejects the transaction.
        return { hand: -1, bank: -1, use_total_on_subtract: false };
      }
      total -= subAmount;

      const newHand = Math.max(0, total - (a.bank ?? 0));
      const newBank = Math.max(0, total - newHand);

      return {
        hand: newHand,
        bank: newBank,
        use_total_on_subtract: false,
      };
    } else {
      return {
        hand: (a.hand ?? 0) - (b.hand ?? 0),
        bank: (a.bank ?? 0) - (b.bank ?? 0),
        use_total_on_subtract: false,
      };
    }
  }

  isValid(value: CoinValue): boolean {
    return value.hand >= 0 && value.bank >= 0;
  }
}
