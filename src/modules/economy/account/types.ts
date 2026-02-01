/**
 * Economy Account domain types.
 *
 * Purpose: Define the core domain model for economy accounts including
 * status tracking, lifecycle metadata, and view types for read-only operations.
 *
 * Encaje: Base types used by repository, service, and view layers.
 * Dependencies: None (pure types).
 * Invariants:
 * - AccountStatus is always one of: 'ok', 'blocked', 'banned'.
 * - All timestamps are native Date objects.
 * - version is a non-negative integer for optimistic concurrency.
 */

import type { CurrencyId } from "../currency";
import type { ProgressionView } from "../progression/types";

/** Account status for moderation and access control. */
export type AccountStatus = "ok" | "blocked" | "banned";

/** Core economy account entity stored per user. */
export interface EconomyAccount {
  readonly userId: string;
  readonly status: AccountStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastActivityAt: Date;
  readonly version: number;
}

/** Sanitized view of account for external display (no internal fields). */
export interface EconomyAccountView {
  readonly status: AccountStatus;
  readonly statusDisplay: string;
  readonly createdAt: Date;
  readonly lastActivityAt: Date;
  readonly daysSinceCreated: number;
  readonly daysSinceActivity: number;
}

// ============================================================================
// Currency View Types
// ============================================================================

/** Single currency balance formatted for display. */
export interface CurrencyBalanceView {
  readonly id: CurrencyId;
  readonly name: string;
  readonly display: string;
  readonly raw: unknown;
}

/** Complete balance view with all currencies. */
export interface BalanceView {
  readonly currencies: CurrencyBalanceView[];
  readonly primaryCurrency: CurrencyBalanceView | null;
  readonly hasMultipleCurrencies: boolean;
  readonly hiddenCount: number; // Number of currencies not shown ("and X more")
}

/** Bank breakdown specific to coin currency with hand/bank split. */
export interface BankBreakdownView {
  readonly hand: number;
  readonly bank: number;
  readonly total: number;
  readonly percentInBank: number;
  readonly percentInHand: number;
  readonly isEmpty: boolean;
}

/** Parameters for customizing balance view display. */
export interface BalanceViewOptions {
  /** Maximum currencies to show before collapsing. Default: 4. */
  readonly maxVisible?: number;
  /** Whether to show zero balances. Default: false. */
  readonly showZeroBalances?: boolean;
  /** Specific currency to highlight as primary. */
  readonly primaryCurrencyId?: CurrencyId;
}

// ============================================================================
// Inventory View Types
// ============================================================================

/** Single inventory item formatted for display. */
export interface InventoryItemView {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly quantity: number;
  readonly description: string;
}

/** Summary statistics for inventory. */
export interface InventorySummaryView {
  readonly totalItems: number;
  readonly uniqueItems: number;
  readonly topItems: InventoryItemView[];
  readonly isEmpty: boolean;
}

/** Paginated view of inventory items. */
export interface InventoryPageView {
  readonly items: InventoryItemView[];
  readonly page: number;
  readonly totalPages: number;
  readonly totalItems: number;
  readonly hasMore: boolean;
}

/** Parameters for inventory pagination. */
export interface InventoryPaginationOptions {
  readonly page: number;
  readonly pageSize: number;
  /** Sort field. Default: 'name'. */
  readonly sortBy?: "name" | "quantity" | "id";
  /** Sort direction. Default: 'asc'. */
  readonly sortOrder?: "asc" | "desc";
  /** Optional filter by item name/id substring. */
  readonly search?: string;
}

// ============================================================================
// Profile View Type
// ============================================================================

/** Composite profile view combining all economy data. */
export interface ProfileSummaryView {
  readonly userId: string;
  readonly account: EconomyAccountView;
  readonly balances: BalanceView;
  readonly bank: BankBreakdownView | null;
  readonly inventory: InventorySummaryView;
  readonly reputation: number;
  readonly progression: ProgressionView | null;
}

// ============================================================================
// Service Result Types
// ============================================================================

/** Result of ensuring an account exists. */
export interface AccountEnsureResult {
  readonly account: EconomyAccount;
  readonly isNew: boolean;
}

/** Result of a repair operation on corrupted data. */
export interface AccountRepairResult {
  readonly wasCorrupted: boolean;
  readonly repairedFields: string[];
  readonly account: EconomyAccount;
}

// ============================================================================
// Error Types
// ============================================================================

export type EconomyErrorCode =
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_BLOCKED"
  | "ACCOUNT_BANNED"
  | "CONCURRENT_MODIFICATION"
  | "INVALID_CURRENCY"
  | "INVALID_STATUS_TRANSITION"
  | "CORRUPTED_DATA";

export class EconomyError extends Error {
  constructor(
    public readonly code: EconomyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EconomyError";
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/** Check if value is a valid AccountStatus. */
export function isValidAccountStatus(value: unknown): value is AccountStatus {
  return value === "ok" || value === "blocked" || value === "banned";
}

/** Check if value conforms to EconomyAccount shape. */
export function isEconomyAccount(value: unknown): value is EconomyAccount {
  if (!value || typeof value !== "object") return false;
  const acc = value as Partial<EconomyAccount>;
  return (
    typeof acc.userId === "string" &&
    isValidAccountStatus(acc.status) &&
    acc.createdAt instanceof Date &&
    acc.updatedAt instanceof Date &&
    typeof acc.version === "number" &&
    Number.isInteger(acc.version) &&
    acc.version >= 0
  );
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_ECONOMY_ACCOUNT: Omit<EconomyAccount, "userId"> = {
  status: "ok",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastActivityAt: new Date(),
  version: 0,
};

export const ACCOUNT_STATUS_DISPLAY: Record<AccountStatus, string> = {
  ok: "✅ Active",
  blocked: "⛔ Blocked",
  banned: "🚫 Banned",
};

export const EMPTY_BANK_BREAKDOWN: BankBreakdownView = {
  hand: 0,
  bank: 0,
  total: 0,
  percentInBank: 0,
  percentInHand: 0,
  isEmpty: true,
};

export const EMPTY_INVENTORY_SUMMARY: InventorySummaryView = {
  totalItems: 0,
  uniqueItems: 0,
  topItems: [],
  isEmpty: true,
};

/** Default pagination settings. */
export const DEFAULT_INVENTORY_PAGINATION: Required<
  Omit<InventoryPaginationOptions, "search">
> = {
  page: 0,
  pageSize: 6,
  sortBy: "name",
  sortOrder: "asc",
};

/** Maximum items per page for inventory. */
export const MAX_INVENTORY_PAGE_SIZE = 25;

/** Default visible currencies before collapsing. */
export const DEFAULT_MAX_VISIBLE_CURRENCIES = 4;
