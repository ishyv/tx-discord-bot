/**
 * Economy Account Repository.
 *
 * Purpose: Handle persistence and lifecycle of economy account metadata.
 * Encaje: Wraps UserStore to provide account-specific operations with
 * lazy initialization, status management, and data repair.
 *
 * Dependencies:
 * - UserStore for persistence
 * - EconomyAccountSchema for validation/repair
 * - runUserTransition for optimistic concurrency
 *
 * Invariants:
 * - Accounts are lazy-initialized on first ensure() call.
 * - Corrupted data is auto-repaired with logging.
 * - Status changes use optimistic concurrency (version check).
 * - All operations return Result<T, Error> (no exceptions).
 *
 * Gotchas:
 * - touchActivity() is fire-and-forget; failures are logged but not propagated.
 * - Repair operations increment version to signal data was touched.
 */

import { UserStore } from "@/db/repositories/users";
import type { User } from "@/db/schemas/user";
import {
  EconomyAccountSchema,
  type EconomyAccountData,
  repairEconomyAccount,
  detectCorruption,
} from "@/db/schemas/economy-account";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { runUserTransition } from "@/db/user-transition";
import type { UserId } from "@/db/types";
import {
  type EconomyAccount,
  type AccountStatus,
  type AccountEnsureResult,
  type AccountRepairResult,
  EconomyError,
} from "./types";

/** Convert DB data to domain model. */
function toDomain(userId: string, data: EconomyAccountData): EconomyAccount {
  return {
    userId,
    status: data.status,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    lastActivityAt: data.lastActivityAt,
    version: data.version,
  };
}

/** Build DB data from domain model. */
function toData(account: EconomyAccount): EconomyAccountData {
  return {
    status: account.status,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    lastActivityAt: account.lastActivityAt,
    version: account.version,
  };
}

/**
 * Extract economy account from user document with repair capability.
 * Returns null if field is missing (not yet initialized).
 * Repairs corrupted data automatically and logs the issue.
 */
function extractAccount(
  user: User,
  userId: string,
  shouldRepair: boolean,
): { account: EconomyAccount | null; wasRepaired: boolean } {
  const raw = user.economyAccount;

  if (!raw) {
    return { account: null, wasRepaired: false };
  }

  // Check for corruption
  const corruption = detectCorruption(raw);
  if (corruption.length > 0) {
    console.warn(
      `[EconomyAccountRepo] Detected corrupted data for user ${userId}, fields: ${corruption.join(", ")}`,
    );

    if (shouldRepair) {
      const repaired = repairEconomyAccount(raw);
      console.info(
        `[EconomyAccountRepo] Auto-repaired account for user ${userId}`,
      );
      return {
        account: toDomain(userId, repaired),
        wasRepaired: true,
      };
    }
  }

  const parsed = EconomyAccountSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(
      `[EconomyAccountRepo] Failed to parse account for user ${userId}, using defaults`,
    );
    const repaired = repairEconomyAccount(raw);
    return {
      account: toDomain(userId, repaired),
      wasRepaired: true,
    };
  }

  return {
    account: toDomain(userId, parsed.data),
    wasRepaired: false,
  };
}

export interface EconomyAccountRepo {
  /**
   * Find account by user ID.
   * Returns null if user exists but has no economy account (not initialized).
   * Returns error if user lookup fails.
   */
  findById(userId: UserId): Promise<Result<EconomyAccount | null, Error>>;

  /**
   * Ensure account exists, creating lazily if needed.
   * Returns the account and whether it was newly created.
   */
  ensure(userId: UserId): Promise<Result<AccountEnsureResult, Error>>;

  /**
   * Update account status with optimistic concurrency.
   * Returns null if version mismatch (concurrent modification).
   */
  updateStatus(
    userId: UserId,
    status: AccountStatus,
    expectedVersion: number,
  ): Promise<Result<EconomyAccount | null, Error>>;

  /**
   * Touch last activity timestamp.
   * Fire-and-forget: failures are logged but not returned.
   */
  touchActivity(userId: UserId): Promise<void>;

  /**
   * Repair corrupted account data explicitly.
   * Returns info about what was repaired.
   */
  repair(userId: UserId): Promise<Result<AccountRepairResult, Error>>;
}

class EconomyAccountRepoImpl implements EconomyAccountRepo {
  async findById(
    userId: UserId,
  ): Promise<Result<EconomyAccount | null, Error>> {
    const userResult = await UserStore.get(userId);
    if (userResult.isErr()) {
      return ErrResult(userResult.error);
    }

    const user = userResult.unwrap();
    if (!user) {
      return OkResult(null);
    }

    // NOTE: Do NOT repair here. findById is a pure read operation.
    // Repair happens in ensure() or repair() only.
    const { account } = extractAccount(user, userId, false);
    return OkResult(account);
  }

  async ensure(userId: UserId): Promise<Result<AccountEnsureResult, Error>> {
    // First ensure user exists
    const userResult = await UserStore.ensure(userId);
    if (userResult.isErr()) {
      return ErrResult(userResult.error);
    }

    const user = userResult.unwrap();
    const { account, wasRepaired } = extractAccount(user, userId, true);

    // If account exists and wasn't corrupted, return it
    if (account && !wasRepaired) {
      return OkResult({ account, isNew: false });
    }

    // If account exists but was repaired, persist the repair
    if (account && wasRepaired) {
      const repairResult = await this.persistRepair(userId, account);
      if (repairResult.isErr()) {
        return ErrResult(repairResult.error);
      }
      return OkResult({ account: repairResult.unwrap(), isNew: false });
    }

    // Need to create new account
    const now = new Date();
    const newAccount: EconomyAccount = {
      userId,
      status: "ok",
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
      version: 0,
    };

    // Use atomic transition to initialize
    const result = await runUserTransition(userId, {
      getSnapshot: (u) => u.economyAccount,
      computeNext: () => OkResult(toData(newAccount)),
      commit: (id, _expected, next) =>
        UserStore.patch(id, { economyAccount: next } as any),
      project: (updatedUser) => {
        const data = updatedUser.economyAccount!;
        return {
          account: toDomain(userId, data),
          isNew: true,
        };
      },
      conflictError: "ECONOMY_ACCOUNT_INIT_CONFLICT",
    });

    // Handle race condition: if conflict, someone else created it. Re-read and return existing.
    if (result.isErr()) {
      const error = result.error;
      if (
        error instanceof Error &&
        error.message === "ECONOMY_ACCOUNT_INIT_CONFLICT"
      ) {
        const freshResult = await this.findById(userId);
        if (freshResult.isErr()) return ErrResult(freshResult.error);
        const existing = freshResult.unwrap();
        if (existing) {
          return OkResult({ account: existing, isNew: false });
        }
        // If somehow still null, return the original error
      }
      return result;
    }

    return result;
  }

  async updateStatus(
    userId: UserId,
    status: AccountStatus,
    expectedVersion: number,
  ): Promise<Result<EconomyAccount | null, Error>> {
    return runUserTransition(userId, {
      getSnapshot: (u) => {
        const { account } = extractAccount(u, userId, false);
        return account;
      },
      computeNext: (current) => {
        if (!current) {
          return ErrResult(
            new EconomyError("ACCOUNT_NOT_FOUND", "Account does not exist"),
          );
        }
        if (current.version !== expectedVersion) {
          return ErrResult(
            new EconomyError("CONCURRENT_MODIFICATION", "Version mismatch"),
          );
        }
        const next: EconomyAccount = {
          ...current,
          status,
          updatedAt: new Date(),
          version: current.version + 1,
        };
        return OkResult(next);
      },
      commit: (id, _expected, next) =>
        UserStore.patch(id, {
          economyAccount: toData(next as EconomyAccount),
        } as any),
      project: (updatedUser) => {
        const data = updatedUser.economyAccount;
        return data ? toDomain(userId, data) : null;
      },
      conflictError: "ECONOMY_ACCOUNT_STATUS_CONFLICT",
    });
  }

  async touchActivity(userId: UserId): Promise<void> {
    try {
      const now = new Date();
      // Use updatePaths for lightweight touch (no read required)
      await UserStore.updatePaths(
        userId,
        { "economyAccount.lastActivityAt": now },
        { upsert: false },
      );
    } catch (error) {
      // Fire-and-forget: log but don't propagate
      console.warn(
        `[EconomyAccountRepo] Failed to touch activity for ${userId}`,
        error,
      );
    }
  }

  async repair(userId: UserId): Promise<Result<AccountRepairResult, Error>> {
    const userResult = await UserStore.get(userId);
    if (userResult.isErr()) {
      return ErrResult(userResult.error);
    }

    const user = userResult.unwrap();
    if (!user) {
      return ErrResult(new EconomyError("ACCOUNT_NOT_FOUND", "User not found"));
    }

    const raw = user.economyAccount;
    const corruption = detectCorruption(raw);

    if (corruption.length === 0) {
      // No corruption detected
      const { account } = extractAccount(user, userId, false);
      return OkResult({
        wasCorrupted: false,
        repairedFields: [],
        account: account!,
      });
    }

    const repaired = repairEconomyAccount(raw);
    const account = toDomain(userId, repaired);

    // Persist the repair
    const persistResult = await this.persistRepair(userId, account);
    if (persistResult.isErr()) {
      return ErrResult(persistResult.error);
    }

    return OkResult({
      wasCorrupted: true,
      repairedFields: corruption,
      account: persistResult.unwrap(),
    });
  }

  private async persistRepair(
    userId: UserId,
    account: EconomyAccount,
  ): Promise<Result<EconomyAccount, Error>> {
    // Increment version to signal data was touched
    const data = {
      ...toData(account),
      version: account.version + 1,
      updatedAt: new Date(),
    };

    const result = await UserStore.patch(userId, {
      economyAccount: data,
    } as any);
    if (result.isErr()) {
      return ErrResult(result.error);
    }

    const accountData = result.unwrap().economyAccount;
    if (!accountData) {
      return ErrResult(
        new Error("Repair failed: economyAccount still missing after patch"),
      );
    }
    return OkResult(toDomain(userId, accountData));
  }
}

/** Singleton instance. */
export const economyAccountRepo: EconomyAccountRepo =
  new EconomyAccountRepoImpl();
