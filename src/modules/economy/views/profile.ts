/**
 * Profile View Builder.
 *
 * Purpose: Aggregate all economy data into a composite profile view.
 * Encaje: Combines account, balance, bank, and inventory views.
 * Dependencies: All other view builders, UserStore for raw data.
 *
 * Invariants:
 * - All sub-views are computed consistently.
 * - Account view sanitizes internal fields.
 * - Days calculations use UTC boundaries.
 */

import type { CurrencyInventory } from "../currency";
import type { ItemInventory } from "@/modules/inventory/inventory";
import {
  type EconomyAccount,
  type EconomyAccountView,
  type ProfileSummaryView,
  type BalanceViewOptions,
  ACCOUNT_STATUS_DISPLAY,
} from "../account/types";
import type { ProgressionView } from "../progression/types";
import { buildBalanceView } from "./balance";
import { buildBankBreakdown } from "./bank";
import { buildInventorySummary } from "./inventory";

/** Calculate days between date and now. */
function daysSince(date: Date): number {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/** Build sanitized account view for external display. */
function buildAccountView(account: EconomyAccount): EconomyAccountView {
  return {
    status: account.status,
    statusDisplay: ACCOUNT_STATUS_DISPLAY[account.status],
    createdAt: account.createdAt,
    lastActivityAt: account.lastActivityAt,
    daysSinceCreated: daysSince(account.createdAt),
    daysSinceActivity: daysSince(account.lastActivityAt),
  };
}

/** Get reputation from currency inventory. */
function getReputation(inventory: CurrencyInventory): number {
  const raw = inventory.rep;
  if (typeof raw === "number") {
    return Math.max(0, Math.trunc(raw));
  }
  return 0;
}

export interface ProfileViewBuilderOptions {
  /** Options for balance view construction. */
  readonly balanceOptions?: BalanceViewOptions;
}

/**
 * Build complete profile summary view.
 * This is a synchronous pure function - callers must fetch data first.
 */
export function buildProfileView(
  userId: string,
  account: EconomyAccount,
  currencyInventory: CurrencyInventory,
  itemInventory: ItemInventory,
  progression: ProgressionView | null,
  options: ProfileViewBuilderOptions = {},
): ProfileSummaryView {
  const accountView = buildAccountView(account);
  const balanceView = buildBalanceView(
    currencyInventory,
    options.balanceOptions,
  );
  const bankView = buildBankBreakdown(currencyInventory);
  const inventoryView = buildInventorySummary(itemInventory);
  const reputation = getReputation(currencyInventory);

  return {
    userId,
    account: accountView,
    balances: balanceView,
    bank: bankView,
    inventory: inventoryView,
    reputation,
    progression,
  };
}

/**
 * Build lightweight profile view for quick checks.
 * Omits inventory details (just summary) and limits currencies shown.
 */
export function buildCompactProfileView(
  userId: string,
  account: EconomyAccount,
  currencyInventory: CurrencyInventory,
  itemInventory: ItemInventory,
): Omit<ProfileSummaryView, "balances"> & {
  balances: {
    primaryCurrency: { display: string } | null;
    hasMultipleCurrencies: boolean;
  };
} {
  const accountView = buildAccountView(account);
  const balanceView = buildBalanceView(currencyInventory, {
    maxVisible: 2,
    showZeroBalances: false,
  });
  const inventoryView = buildInventorySummary(itemInventory);
  const reputation = getReputation(currencyInventory);

  return {
    userId,
    account: accountView,
    balances: {
      primaryCurrency: balanceView.primaryCurrency,
      hasMultipleCurrencies: balanceView.hasMultipleCurrencies,
    },
    bank: null, // Omitted in compact view
    inventory: inventoryView,
    reputation,
    progression: null,
  };
}
