/**
 * Type/Interface Sketches for Economy Account Integration
 * 
 * This file contains concrete type definitions and interface sketches
 * for the economy account integration. These are NOT implementation files
 * but serve as reference for the actual implementation.
 */

import type { Result } from "../src/utils/result";
import type { CurrencyInventory, CurrencyId } from "../src/modules/economy/currency";
import type { ItemInventory } from "../src/modules/inventory/inventory";

// ============================================================================
// Domain Types (src/modules/economy/account/types.ts)
// ============================================================================

export type AccountStatus = 'ok' | 'blocked' | 'banned';

export interface EconomyAccount {
  readonly userId: string;
  readonly status: AccountStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastActivityAt: Date;
  readonly version: number;
}

// ============================================================================
// View Types (src/modules/economy/views/)
// ============================================================================

export interface CurrencyBalanceView {
  readonly id: CurrencyId;
  readonly name: string;
  readonly display: string;
  readonly raw: unknown;
}

export interface BalanceView {
  readonly currencies: CurrencyBalanceView[];
  readonly totalValue: string;  // Human-readable aggregate (may be abstract)
}

export interface BankBreakdownView {
  readonly hand: number;
  readonly bank: number;
  readonly total: number;
  readonly percentInBank: number;
}

export interface InventoryItemView {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly quantity: number;
  readonly description: string;
}

export interface InventorySummaryView {
  readonly totalItems: number;      // Sum of all quantities
  readonly uniqueItems: number;     // Count of different item types
  readonly topItems: InventoryItemView[];
  readonly isEmpty: boolean;
}

export interface ProfileSummaryView {
  readonly userId: string;
  readonly account: EconomyAccountView;
  readonly balances: BalanceView;
  readonly inventory: InventorySummaryView;
  readonly reputation: number;
}

export interface EconomyAccountView {
  readonly status: AccountStatus;
  readonly statusDisplay: string;
  readonly createdAt: Date;
  readonly lastActivityAt: Date;
  readonly daysSinceCreated: number;
  readonly daysSinceActivity: number;
}

// ============================================================================
// Repository Interface (src/modules/economy/account/repository.ts)
// ============================================================================

export interface EconomyAccountRepo {
  /**
   * Find account by user ID. Returns null if user exists but has no
   * economy account metadata (not yet initialized).
   */
  findById(userId: string): Promise<Result<EconomyAccount | null, Error>>;
  
  /**
   * Ensure account exists. Creates lazily if missing.
   * This is the primary read method that initializes on first access.
   */
  ensure(userId: string): Promise<Result<EconomyAccount, Error>>;
  
  /**
   * Update account status with optimistic concurrency.
   * Returns null if version mismatch (concurrent modification).
   */
  updateStatus(
    userId: string, 
    status: AccountStatus, 
    expectedVersion: number
  ): Promise<Result<EconomyAccount | null, Error>>;
  
  /**
   * Touch last activity timestamp.
   * Called on each economy interaction for analytics.
   */
  touchActivity(userId: string): Promise<Result<void, Error>>;
}

// ============================================================================
// Service Interface (src/modules/economy/account/service.ts)
// ============================================================================

export interface EconomyAccountService {
  /** Get or create account metadata */
  getAccount(userId: string): Promise<Result<EconomyAccount, Error>>;
  
  /** Build formatted balance view for all currencies */
  getBalanceView(userId: string): Promise<Result<BalanceView, Error>>;
  
  /** Get bank breakdown for coins currency */
  getBankBreakdown(userId: string): Promise<Result<BankBreakdownView | null, Error>>;
  
  /** Get inventory summary statistics */
  getInventorySummary(userId: string): Promise<Result<InventorySummaryView, Error>>;
  
  /** Get full profile summary (composite of all above) */
  getProfileSummary(userId: string): Promise<Result<ProfileSummaryView, Error>>;
  
  /** Explicitly ensure account exists (for admin operations) */
  ensureAccount(userId: string): Promise<Result<EconomyAccount, Error>>;
}

// ============================================================================
// View Builder Types (src/modules/economy/views/)
// ============================================================================

export interface BalanceViewBuilder {
  build(inventory: CurrencyInventory): BalanceView;
}

export interface BankBreakdownCalculator {
  calculate(coins: { hand: number; bank: number } | undefined): BankBreakdownView | null;
}

export interface InventorySummaryBuilder {
  build(inventory: ItemInventory): InventorySummarySummaryView;
}

// ============================================================================
// Zod Schema Sketch (src/db/schemas/economy-account.ts)
// ============================================================================

/*
import { z } from "zod";

export const EconomyAccountSchema = z.object({
  status: z.enum(['ok', 'blocked', 'banned']).catch('ok'),
  createdAt: z.date().catch(() => new Date()),
  updatedAt: z.date().catch(() => new Date()),
  lastActivityAt: z.date().catch(() => new Date()),
  version: z.number().int().nonnegative().catch(0),
});

export type EconomyAccountDb = z.infer<typeof EconomyAccountSchema>;
*/

// ============================================================================
// User Schema Extension (src/db/schemas/user.ts)
// ============================================================================

/*
// Add to existing UserSchema:
economyAccount: EconomyAccountSchema.optional().catch(() => undefined),
*/

// ============================================================================
// Configuration (Optional - for guild-specific economy settings)
// ============================================================================

export interface EconomyConfig {
  readonly startingCoins: number;
  readonly maxBankPercent: number;  // For future loan/credit features
  readonly dailyRewardAmount: number;
  readonly dailyRewardEnabled: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

export type EconomyErrorCode = 
  | 'ACCOUNT_NOT_FOUND'
  | 'ACCOUNT_BLOCKED'
  | 'ACCOUNT_BANNED'
  | 'CONCURRENT_MODIFICATION'
  | 'INVALID_CURRENCY'
  | 'INVALID_STATUS_TRANSITION';

export class EconomyError extends Error {
  constructor(
    public readonly code: EconomyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EconomyError';
  }
}

// ============================================================================
// Type Guards
// ============================================================================

export function isValidAccountStatus(value: unknown): value is AccountStatus {
  return value === 'ok' || value === 'blocked' || value === 'banned';
}

export function isEconomyAccount(value: unknown): value is EconomyAccount {
  if (!value || typeof value !== 'object') return false;
  const acc = value as Partial<EconomyAccount>;
  return (
    typeof acc.userId === 'string' &&
    isValidAccountStatus(acc.status) &&
    acc.createdAt instanceof Date &&
    acc.updatedAt instanceof Date &&
    typeof acc.version === 'number'
  );
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_ECONOMY_ACCOUNT: Omit<EconomyAccount, 'userId'> = {
  status: 'ok',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastActivityAt: new Date(),
  version: 0,
};

export const EMPTY_BANK_BREAKDOWN: BankBreakdownView = {
  hand: 0,
  bank: 0,
  total: 0,
  percentInBank: 0,
};

export const EMPTY_INVENTORY_SUMMARY: InventorySummaryView = {
  totalItems: 0,
  uniqueItems: 0,
  topItems: [],
  isEmpty: true,
};
