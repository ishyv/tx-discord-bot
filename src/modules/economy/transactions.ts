/**
 * Transacciones de economía (monedas) con concurrencia optimista.
 *
 * Encaje en el sistema:
 * - Este módulo aplica cambios a `user.currency` (inventario de monedas) de forma determinística.
 * - Se apoya en:
 *   - `CurrencyRegistry`: define reglas por moneda (`add/sub/zero/isValid`).
 *   - `users` repo: lectura/ensure del usuario.
 *   - `replaceCurrencyIfMatch`: update condicional para evitar perder escrituras concurrentes.
 *
 * Invariantes clave:
 * - Una transacción debe tener `costs` o `rewards`.
 * - Cada moneda debe validar su estado (`isValid`) tras aplicar `add/sub`.
 * - El inventario persistido es el **resultado** del motor (`CurrencyEngine`), no una suma "a mano".
 *
 * Gotchas:
 * - Concurrencia: dos comandos pueden intentar actualizar balances al mismo tiempo.
 *   Este módulo evita el "lost update" con un loop de reintentos (optimistic concurrency).
 */
import { CurrencyId, type CurrencyInventory } from "./currency";
import { CurrencyRegistry, currencyRegistry } from "./currencyRegistry";
import { ErrResult, OkResult, Result } from "@/utils/result";

import "./currencies/coin";
import { ensureUser, replaceCurrencyIfMatch } from "@/db/repositories";
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
    // WHY: Esta función es el "core" del motor: unifica la aplicación de costos/recompensas
    // y valida cada paso.
    // RISK: Si se omite `isValid`, una moneda podría quedar en estado inválido y luego
    // romper otras operaciones (o permitir balances negativos).
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
  // Propósito: aplicar `tx` sobre el inventario de monedas del usuario y persistirlo.
  //
  // Side effects:
  // - Lee y escribe en Mongo (users collection).
  //
  // Errores:
  // - `Err(...)` si la transacción es inválida, no puede aplicarse o si hay problemas de DB.
  // - `Err("CURRENCY_TX_CONFLICT")` si no se pudo ganar la carrera luego de varios reintentos.
  const userResult = await ensureUser(userId);
  if (userResult.isErr()) return ErrResult(userResult.error);
  let inv: CurrencyInventory = (userResult.unwrap().currency as CurrencyInventory) ?? {};

  // Optimistic retry loop to avoid lost updates under concurrent writes.
  // WHY: Mongo update es "last write wins" si no condicionamos por estado previo.
  // RISK: Si quitamos el retry, dos comandos concurrentes pueden pisarse y perder dinero.
  // ALT: Transacciones de Mongo/locks. Se descartó por costo/complexidad; el patrón CAS
  // (compare-and-swap) es suficiente para este caso.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = engine.apply(inv, tx);
    if (result.isErr()) {
      return result;
    }

    const updated = await replaceCurrencyIfMatch(userId, inv, result.unwrap());
    if (updated.isErr()) return ErrResult(updated.error);
    const updatedUser = updated.unwrap();
    if (updatedUser) {
      return OkResult(updatedUser.currency ?? {});
    }

    // Currency changed concurrently; reload and retry.
    const fresh = await ensureUser(userId);
    if (fresh.isErr()) return ErrResult(fresh.error);
    inv = fresh.unwrap().currency ?? {};
  }

  return ErrResult(new Error("CURRENCY_TX_CONFLICT"));
}
