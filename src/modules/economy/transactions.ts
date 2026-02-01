/**
 * Economy transactions (coins) with optimistic concurrency.
 *
 * System context:
 * - This module applies changes to `user.currency` (coin inventory) deterministically.
 * - Relies on:
 *   - `CurrencyRegistry`: defines rules per currency (`add/sub/zero/isValid`).
 *   - `users` repo: user read/ensure.
 *   - `replaceCurrencyIfMatch`: conditional update to avoid lost concurrent writes.
 *
 * Key Invariants:
 * - A transaction must have `costs` or `rewards`.
 * - Each currency must validate its state (`isValid`) after applying `add/sub`.
 * - Persisted inventory is the **result** of the engine (`CurrencyEngine`), not a manual sum.
 *
 * Gotchas:
 * - Concurrency: two commands may attempt to update balances simultaneously.
 *   This module avoids "lost updates" with a retry loop (optimistic concurrency).
 */
import { CurrencyId, type CurrencyInventory } from "./currency";
import { CurrencyRegistry, currencyRegistry } from "./currencyRegistry";
import { ErrResult, OkResult, Result } from "@/utils/result";

import "./currencies/coin";
import "./currencies/reputation";
import { runUserTransition } from "@/db/user-transition";
import { UserStore } from "@/db/repositories/users";
export { registerCurrency, currencyRegistry } from "./currencyRegistry";

export type CurrencyAmount<TValue = unknown> = {
  currencyId: CurrencyId;
  value: TValue;
};

export type Transaction = {
  /** What gets deducted from the inventory. */
  costs?: CurrencyAmount[];
  /** What gets added to the inventory. */
  rewards?: CurrencyAmount[];
  /** Allow negative balances (debt) if true. */
  allowDebt?: boolean;
};

export type TransactionResult = Result<CurrencyInventory, Error>;

class CurrencyEngine {
  constructor(private readonly registry: CurrencyRegistry) { }

  private applyAmounts(
    target: CurrencyInventory,
    amounts: CurrencyAmount[],
    op: "add" | "sub",
    tx: Transaction,
  ): boolean {
    // WHY: This function is the "core" of the engine: it unifies the application of costs/rewards
    // and validates each step.
    // RISK: If `isValid` is omitted, a currency could be left in an invalid state and then
    // break other operations (or allow negative balances).
    for (const amount of amounts) {
      const currency = this.registry.get(amount.currencyId);
      if (!currency) {
        return false;
      }

      const current =
        amount.currencyId in target
          ? target[amount.currencyId]
          : currency.zero();

      const next =
        op === "add"
          ? currency.add(current, amount.value)
          : currency.sub(current, amount.value);

      if (!tx.allowDebt && !currency.isValid(next)) {
        return false;
      }

      target[amount.currencyId] = next;
    }

    return true;
  }

  canApply(inv: CurrencyInventory, tx: Transaction): boolean {
    const snapshot: CurrencyInventory = { ...inv };
    const costs = tx.costs ?? [];
    const rewards = tx.rewards ?? [];

    return (
      this.applyAmounts(snapshot, costs, "sub", tx) &&
      this.applyAmounts(snapshot, rewards, "add", tx)
    );
  }

  apply(inv: CurrencyInventory, tx: Transaction): TransactionResult {
    const costs = tx.costs ?? [];
    const rewards = tx.rewards ?? [];

    if (costs.length === 0 && rewards.length === 0) {
      return ErrResult(new Error("Transaction must have costs or rewards."));
    }

    if (!this.canApply(inv, tx)) {
      return ErrResult(
        new Error(
          "Transaction cannot be applied: insufficient funds or invalid currency.",
        ),
      );
    }

    const next: CurrencyInventory = { ...inv };

    this.applyAmounts(next, costs, "sub", tx);
    this.applyAmounts(next, rewards, "add", tx);

    return OkResult(next);
  }
}

export const currencyEngine = new CurrencyEngine(currencyRegistry);

/**
 * Applies a currency transaction to a user.
 */
export async function currencyTransaction(
  userId: string,
  tx: Transaction,
  engine: CurrencyEngine = currencyEngine,
): Promise<TransactionResult> {
  // Purpose: Apply `tx` to the user's coin inventory and persist it.
  //
  // Side effects:
  // - Reads and writes in Mongo (users collection).
  //
  // Errors:
  // - `Err(...)` if the transaction is invalid, cannot be applied or if there are DB issues.
  // - `Err("CURRENCY_TX_CONFLICT")` if the race could not be won after several retries.
  // Optimistic retry loop to avoid lost updates under concurrent writes.
  // WHY: Mongo update is "last write wins" if we don't condition by previous state.
  // RISK: If we remove retry, two concurrent commands may overwrite each other and lose money.
  // ALT: Mongo transactions/locks. Discarded due to cost/complexity; CAS pattern
  // (compare-and-swap) is sufficient for this case.
  return runUserTransition(userId, {
    getSnapshot: (user) => (user.currency as CurrencyInventory) ?? {},
    computeNext: (inv) => engine.apply(inv, tx),
    commit: (id, expected, next) =>
      UserStore.replaceIfMatch(
        id,
        { currency: expected } as any,
        { currency: next } as any,
      ),
    project: (updatedUser) => (updatedUser.currency ?? {}) as CurrencyInventory,
    conflictError: "CURRENCY_TX_CONFLICT",
  });
}
