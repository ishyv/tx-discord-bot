import { CurrencyId, CurrencyInventory } from "./currency";
import { CurrencyRegistry, currencyRegistry } from "./currencyRegistry";
import { ErrResult, OkResult, Result } from "@/utils/result";

import "./currencies/coin";
import { ensureUser, toUser } from "@/db/repositories";
import { connectMongo, UserModel } from "@/db";
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
};

export type TransactionResult = Result<CurrencyInventory, Error>;

class CurrencyEngine {
  constructor(private readonly registry: CurrencyRegistry) { }

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
          ? currency.add(current, amount.value)
          : currency.sub(current, amount.value);

      if (!currency.isValid(next)) {
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
      this.applyAmounts(snapshot, costs, "sub") &&
      this.applyAmounts(snapshot, rewards, "add")
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
        new Error("Transaction cannot be applied: insufficient funds or invalid currency."),
      );
    }

    const next: CurrencyInventory = { ...inv };

    this.applyAmounts(next, costs, "sub");
    this.applyAmounts(next, rewards, "add");

    return OkResult(next);
  }
}

export const currencyEngine = new CurrencyEngine(currencyRegistry);


/**
 * Aplicar una transacción de moneda a un usuario.
 */
export async function currencyTransaction(
  userId: string,
  tx: Transaction,
  engine: CurrencyEngine = currencyEngine,
): Promise<TransactionResult> {
  const userResult = await ensureUser(userId);
  if (userResult.isErr()) return ErrResult(userResult.error);
  let inv: CurrencyInventory = userResult.unwrap().currency ?? {};

  // Optimistic retry loop to avoid lost updates under concurrent writes.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = engine.apply(inv, tx);
    if (result.isErr()) {
      return result;
    }

    await connectMongo();
    const updated = await UserModel.findOneAndUpdate(
      { _id: userId, currency: inv },
      { $set: { currency: result.unwrap() } },
      { new: true, lean: true },
    );

    if (updated) {
      const mapped = toUser(updated);
      return mapped ? OkResult(mapped.currency ?? {}) : ErrResult(new Error("USER_NOT_FOUND"));
    }

    // Currency changed concurrently; reload and retry.
    const fresh = await UserModel.findById(userId).lean();
    const mapped = toUser(fresh);
    if (!mapped) return ErrResult(new Error("USER_NOT_FOUND"));
    inv = mapped.currency ?? {};
  }

  return ErrResult(new Error("CURRENCY_TX_CONFLICT"));
}
