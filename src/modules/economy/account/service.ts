/**
 * Economy Account Service.
 *
 * Purpose: Orchestrate read-only economy operations with safety edges.
 * Encaje: Service layer between commands and repositories.
 * Dependencies:
 * - EconomyAccountRepo for account metadata
 * - UserStore for currency/inventory data
 * - View builders for presentation
 *
 * Invariants:
 * - All public methods return Result<T, Error> (no exceptions).
 * - Account access is checked before returning data.
 * - Activity is touched on successful reads.
 * - Corrupted data is auto-repaired with logging.
 *
 * Gotchas:
 * - touchActivity is fire-and-forget; failures don't block reads.
 * - Blocked/banned accounts get generic error messages (no leak).
 * - Cache is per-interaction (no persistent caching yet).
 */

import { UserStore } from "@/db/repositories/users";

import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { UserId } from "@/db/types";
import type { CurrencyInventory } from "../currency";
import type { ItemInventory } from "@/modules/inventory/inventory";
import {
  type EconomyAccount,
  type AccountEnsureResult,
  type BalanceView,
  type BalanceViewOptions,
  type BankBreakdownView,
  type InventorySummaryView,
  type InventoryPageView,
  type InventoryPaginationOptions,
  type ProfileSummaryView,
  type AccountRepairResult,
  EconomyError,
} from "./types";
import type { EconomyAccountRepo } from "./repository";
import {
  buildBalanceView,
  buildBankBreakdown,
  buildInventoryPage,
  buildInventorySummary,
  buildProfileView,
} from "../views";

/** Check if account can access economy features. */
function canAccessEconomy(status: string): boolean {
  return status === "ok";
}

/** Gate check result for consistent error handling. */
function checkGate(status: string): Result<void, EconomyError> {
  if (canAccessEconomy(status)) {
    return OkResult(undefined);
  }
  return ErrResult(
    new EconomyError(
      status === "banned" ? "ACCOUNT_BANNED" : "ACCOUNT_BLOCKED",
      "Account access denied",
    ),
  );
}

export interface EconomyAccountService {
  /**
   * Get or create account. Returns account + isNew flag.
   * Safe to call repeatedly (idempotent).
   */
  ensureAccount(userId: UserId): Promise<Result<AccountEnsureResult, Error>>;

  /**
   * Get account if it exists (does not create).
   */
  getAccount(userId: UserId): Promise<Result<EconomyAccount | null, Error>>;

  /**
   * Build balance view with access control.
   * Touches activity on success.
   */
  getBalanceView(
    userId: UserId,
    options?: BalanceViewOptions,
  ): Promise<Result<BalanceView, Error>>;

  /**
   * Build bank breakdown for coin currency.
   * Touches activity on success.
   */
  getBankBreakdown(userId: UserId): Promise<Result<BankBreakdownView | null, Error>>;

  /**
   * Build inventory summary.
   * Touches activity on success.
   */
  getInventorySummary(userId: UserId): Promise<Result<InventorySummaryView, Error>>;

  /**
   * Build paginated inventory view.
   * Touches activity on success.
   */
  getInventoryPage(
    userId: UserId,
    options: InventoryPaginationOptions,
  ): Promise<Result<InventoryPageView, Error>>;

  /**
   * Build complete profile summary.
   * Touches activity on success.
   */
  getProfileSummary(
    userId: UserId,
    options?: { balanceOptions?: BalanceViewOptions },
  ): Promise<Result<ProfileSummaryView, Error>>;

  /**
   * Check if user can access economy features.
   * Does NOT touch activity (lightweight check).
   */
  checkAccess(userId: UserId): Promise<Result<{ allowed: boolean; status?: string }, Error>>;

  /**
   * Explicitly repair corrupted account data.
   * Admin/debug use only.
   */
  repairAccount(userId: UserId): Promise<Result<AccountRepairResult, Error>>;
}

class EconomyAccountServiceImpl implements EconomyAccountService {
  constructor(private repo: EconomyAccountRepo) {}

  async ensureAccount(userId: UserId): Promise<Result<AccountEnsureResult, Error>> {
    return this.repo.ensure(userId);
  }

  async getAccount(userId: UserId): Promise<Result<EconomyAccount | null, Error>> {
    return this.repo.findById(userId);
  }

  async getBalanceView(
    userId: UserId,
    options?: BalanceViewOptions,
  ): Promise<Result<BalanceView, Error>> {
    // Step 1: Ensure account exists (creates if needed, repairs if corrupted)
    const ensureResult = await this.repo.ensure(userId);
    if (ensureResult.isErr()) {
      return ErrResult(ensureResult.error);
    }
    const { account } = ensureResult.unwrap();

    // Step 2: Gate on status
    const gate = checkGate(account.status);
    if (gate.isErr()) {
      return ErrResult(gate.error);
    }

    // Step 3: Load data and build view
    const userResult = await UserStore.get(userId);
    if (userResult.isErr()) {
      return ErrResult(userResult.error);
    }
    const user = userResult.unwrap();
    if (!user) {
      return ErrResult(new EconomyError("ACCOUNT_NOT_FOUND", "User not found"));
    }

    const inventory = (user.currency ?? {}) as CurrencyInventory;
    const view = buildBalanceView(inventory, options);

    // Step 4: Touch activity (fire-and-forget)
    this.repo.touchActivity(userId);

    return OkResult(view);
  }

  async getBankBreakdown(userId: UserId): Promise<Result<BankBreakdownView | null, Error>> {
    // Step 1: Ensure account exists
    const ensureResult = await this.repo.ensure(userId);
    if (ensureResult.isErr()) {
      return ErrResult(ensureResult.error);
    }
    const { account } = ensureResult.unwrap();

    // Step 2: Gate on status
    const gate = checkGate(account.status);
    if (gate.isErr()) {
      return ErrResult(gate.error);
    }

    // Step 3: Load data and build view
    const userResult = await UserStore.get(userId);
    if (userResult.isErr()) {
      return ErrResult(userResult.error);
    }
    const user = userResult.unwrap();
    if (!user) {
      return ErrResult(new EconomyError("ACCOUNT_NOT_FOUND", "User not found"));
    }

    const inventory = (user.currency ?? {}) as CurrencyInventory;
    const view = buildBankBreakdown(inventory);

    this.repo.touchActivity(userId);

    return OkResult(view);
  }

  async getInventorySummary(userId: UserId): Promise<Result<InventorySummaryView, Error>> {
    // Step 1: Ensure account exists
    const ensureResult = await this.repo.ensure(userId);
    if (ensureResult.isErr()) {
      return ErrResult(ensureResult.error);
    }
    const { account } = ensureResult.unwrap();

    // Step 2: Gate on status
    const gate = checkGate(account.status);
    if (gate.isErr()) {
      return ErrResult(gate.error);
    }

    // Step 3: Load data and build view
    const userResult = await UserStore.get(userId);
    if (userResult.isErr()) {
      return ErrResult(userResult.error);
    }
    const user = userResult.unwrap();
    if (!user) {
      return ErrResult(new EconomyError("ACCOUNT_NOT_FOUND", "User not found"));
    }

    const inventory = (user.inventory ?? {}) as ItemInventory;
    const view = buildInventorySummary(inventory);

    this.repo.touchActivity(userId);

    return OkResult(view);
  }

  async getInventoryPage(
    userId: UserId,
    options: InventoryPaginationOptions,
  ): Promise<Result<InventoryPageView, Error>> {
    // Step 1: Ensure account exists
    const ensureResult = await this.repo.ensure(userId);
    if (ensureResult.isErr()) {
      return ErrResult(ensureResult.error);
    }
    const { account } = ensureResult.unwrap();

    // Step 2: Gate on status
    const gate = checkGate(account.status);
    if (gate.isErr()) {
      return ErrResult(gate.error);
    }

    // Step 3: Load data and build view
    const userResult = await UserStore.get(userId);
    if (userResult.isErr()) {
      return ErrResult(userResult.error);
    }
    const user = userResult.unwrap();
    if (!user) {
      return ErrResult(new EconomyError("ACCOUNT_NOT_FOUND", "User not found"));
    }

    const inventory = (user.inventory ?? {}) as ItemInventory;
    const view = buildInventoryPage(inventory, options);

    this.repo.touchActivity(userId);

    return OkResult(view);
  }

  async getProfileSummary(
    userId: UserId,
    options?: { balanceOptions?: BalanceViewOptions },
  ): Promise<Result<ProfileSummaryView, Error>> {
    // Step 1: Ensure account exists (already did this correctly)
    const ensureResult = await this.repo.ensure(userId);
    if (ensureResult.isErr()) {
      return ErrResult(ensureResult.error);
    }

    const { account } = ensureResult.unwrap();

    // Step 2: Gate on status
    const gate = checkGate(account.status);
    if (gate.isErr()) {
      return ErrResult(gate.error);
    }

    // Step 3: Load user data
    const userResult = await UserStore.get(userId);
    if (userResult.isErr()) {
      return ErrResult(userResult.error);
    }

    const user = userResult.unwrap();
    if (!user) {
      return ErrResult(new EconomyError("ACCOUNT_NOT_FOUND", "User not found"));
    }

    const currencyInventory = (user.currency ?? {}) as CurrencyInventory;
    const itemInventory = (user.inventory ?? {}) as ItemInventory;

    const view = buildProfileView(
      userId,
      account,
      currencyInventory,
      itemInventory,
      { balanceOptions: options?.balanceOptions },
    );

    this.repo.touchActivity(userId);

    return OkResult(view);
  }

  async checkAccess(
    userId: UserId,
  ): Promise<Result<{ allowed: boolean; status?: string }, Error>> {
    // For checkAccess, we specifically DON'T ensure - we check what's there
    // This is used for lightweight permission checks before running commands
    const result = await this.repo.findById(userId);
    if (result.isErr()) {
      return ErrResult(result.error);
    }

    const account = result.unwrap();
    if (!account) {
      // No account = not initialized = allowed (will be created on first real use)
      return OkResult({ allowed: true });
    }

    return OkResult({
      allowed: canAccessEconomy(account.status),
      status: account.status,
    });
  }

  async repairAccount(userId: UserId): Promise<Result<AccountRepairResult, Error>> {
    return this.repo.repair(userId);
  }
}

// Factory function for creating service instances
export function createEconomyAccountService(
  repo: EconomyAccountRepo,
): EconomyAccountService {
  return new EconomyAccountServiceImpl(repo);
}
