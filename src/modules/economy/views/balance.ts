/**
 * Balance View Builder.
 *
 * Purpose: Build typed balance views from currency inventory.
 * Encaje: Pure functions transforming raw data to display-ready views.
 * Dependencies: CurrencyRegistry for formatting, BalanceView types.
 *
 * Invariants:
 * - All currency values use registry formatter for consistency.
 * - Zero balances optionally hidden based on options.
 * - Primary currency is highlighted if specified or uses first non-zero.
 */

import { CurrencyRegistry, currencyRegistry } from "../currencyRegistry";
import type { CurrencyInventory } from "../currency";
import {
  type BalanceView,
  type CurrencyBalanceView,
  type BalanceViewOptions,
  DEFAULT_MAX_VISIBLE_CURRENCIES,
} from "../account/types";

export interface BalanceViewBuilder {
  build(
    inventory: CurrencyInventory,
    options?: BalanceViewOptions,
  ): BalanceView;
}

class BalanceViewBuilderImpl implements BalanceViewBuilder {
  constructor(private registry: CurrencyRegistry) { }

  build(
    inventory: CurrencyInventory,
    options: BalanceViewOptions = {},
  ): BalanceView {
    const {
      maxVisible = DEFAULT_MAX_VISIBLE_CURRENCIES,
      showZeroBalances = false,
      primaryCurrencyId,
    } = options;

    const allCurrencies = this.registry.list();
    const currencyViews: CurrencyBalanceView[] = [];

    for (const currencyId of allCurrencies) {
      const currency = this.registry.get(currencyId);
      if (!currency) continue;

      const rawValue = inventory[currencyId];
      const value = rawValue !== undefined ? rawValue : currency.zero();

      // Skip zero balances if not showing them
      if (!showZeroBalances) {
        const zero = currency.zero();
        const isZero = JSON.stringify(value) === JSON.stringify(zero);
        if (isZero) continue;
      }

      currencyViews.push({
        id: currencyId,
        name: this.formatCurrencyName(currencyId),
        display: currency.display(value),
        raw: value,
      });
    }

    // Sort: primary first, then by name
    currencyViews.sort((a, b) => {
      if (a.id === primaryCurrencyId) return -1;
      if (b.id === primaryCurrencyId) return 1;
      return a.name.localeCompare(b.name);
    });

    // Determine visibility
    const visibleCurrencies = currencyViews.slice(0, maxVisible);
    const hiddenCount = Math.max(0, currencyViews.length - maxVisible);

    // Primary currency is first visible or null
    const primaryCurrency = visibleCurrencies[0] ?? null;

    return {
      currencies: visibleCurrencies,
      primaryCurrency,
      hasMultipleCurrencies: currencyViews.length > 1,
      hiddenCount,
    };
  }

  private formatCurrencyName(currencyId: string): string {
    // Map currency IDs to display names
    const names: Record<string, string> = {
      coins: "💰 Coins",
      rep: "⭐ Reputation",
    };
    return names[currencyId] ?? currencyId;
  }
}

/** Default builder instance using global registry. */
export const balanceViewBuilder: BalanceViewBuilder =
  new BalanceViewBuilderImpl(currencyRegistry);

/** Build a balance view with default options. */
export function buildBalanceView(
  inventory: CurrencyInventory,
  options?: BalanceViewOptions,
): BalanceView {
  return balanceViewBuilder.build(inventory, options);
}
