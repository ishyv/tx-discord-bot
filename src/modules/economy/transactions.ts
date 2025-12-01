import { CurrencyId, CurrencyInventory } from "./currency";
import { CurrencyRegistry, currencyRegistry } from "./currencyRegistry";
import { Err, Ok, Result } from "@/utils/result";

import "./currencies/coin";

export type CurrencyAmount<TValue = unknown> = {
  currencyId: CurrencyId;
  value: TValue;
};

export type Transaction = {
  /** What gets deducted from the inventory. */
  costs?: CurrencyAmount[];
  /** What gets added to the inventory. */
  rewards?: CurrencyAmount[];
};

export type TransactionResult = Result<CurrencyInventory, Error>;

class CurrencyEngine {
  constructor(private readonly registry: CurrencyRegistry) {}

  private applyAmounts(
    target: CurrencyInventory,
    amounts: CurrencyAmount[],
    op: "add" | "sub",
  ): boolean {
    for (const amount of amounts) {
      const currency = this.registry.get(amount.currencyId);
      if (!currency) {
        return false;
      }

      const current =
        amount.currencyId in target ? target[amount.currencyId] : currency.zero();

      const next =
        op === "add"
          ? currency.add(current as any, amount.value as any)
          : currency.sub(current as any, amount.value as any);

      if (!currency.isValid(next as any)) {
        return false;
      }

      target[amount.currencyId] = next as any;
    }

    return true;
  }

  canApply(inv: CurrencyInventory, tx: Transaction): boolean {
    const snapshot: CurrencyInventory = { ...inv };
    const costs = tx.costs ?? [];
    const rewards = tx.rewards ?? [];

    return (
      this.applyAmounts(snapshot, costs, "sub") &&
      this.applyAmounts(snapshot, rewards, "add")
    );
  }

  apply(inv: CurrencyInventory, tx: Transaction): TransactionResult {
    const costs = tx.costs ?? [];
    const rewards = tx.rewards ?? [];

    if (costs.length === 0 && rewards.length === 0) {
      return new Err(new Error("Transaction must have costs or rewards."));
    }

    if (!this.canApply(inv, tx)) {
      return new Err(
        new Error("Transaction cannot be applied: insufficient funds or invalid currency."),
      );
    }

    const next: CurrencyInventory = { ...inv };

    this.applyAmounts(next, costs, "sub");
    this.applyAmounts(next, rewards, "add");

    return new Ok(next);
  }
}

export const currencyEngine = new CurrencyEngine(currencyRegistry);

export { registerCurrency, currencyRegistry } from "./currencyRegistry";

/** Apply a transaction using the shared engine/registry. */
export function applyTransaction(
  inv: CurrencyInventory,
  tx: Transaction,
  engine: CurrencyEngine = currencyEngine,
): TransactionResult {
  return engine.apply(inv, tx);
}
