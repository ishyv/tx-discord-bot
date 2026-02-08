/**
 * Economy Moderation Service.
 *
 * Purpose: Business logic for economy moderation (freeze, unfreeze, peek).
 * Context: Used by moderation commands.
 */

import { ErrResult, OkResult, type Result } from "@/utils/result";
import { UserStore } from "@/db/repositories/users";
import { economyAuditRepo } from "../audit/repository";
import type { UserId } from "@/db/types";
import type { AccountStatus } from "../account/types";
import { economyModerationRepo } from "./repository";
import {
  isAccountFrozen,
  MAX_FREEZE_HOURS,
  DEFAULT_AUDIT_LIMIT,
  MAX_AUDIT_LIMIT,
} from "./types";
import type {
  FreezeAccountInput,
  UnfreezeAccountInput,
  FreezeOperationResult,
  EconomyPeekResult,
  ModerationAuditQuery,
  EconomyFreeze,
} from "./types";

/** Generate correlation ID for moderation actions. */
function generateCorrelationId(action: string): string {
  return `mod_${action}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export class EconomyModerationService {
  async freeze(input: FreezeAccountInput): Promise<Result<FreezeOperationResult, Error>> {
    try {
      // Validate hours
      const validation = this.validateFreezeHours(input.hours);
      if (!validation.valid) {
        return ErrResult(new Error(validation.error));
      }

      // Get user
      const userResult = await UserStore.get(input.userId);
      if (userResult.isErr()) {
        return ErrResult(userResult.error);
      }
      const user = userResult.unwrap();
      if (!user) {
        return ErrResult(new Error("User not found"));
      }

      // Get current account status
      const previousStatus = user.economyAccount?.status ?? "ok";
      const newStatus: AccountStatus = input.hours === null ? "banned" : "blocked";

      // Calculate expiration
      const expiresAt = input.hours !== null
        ? new Date(Date.now() + input.hours * 60 * 60 * 1000)
        : null;

      const correlationId = generateCorrelationId("freeze");

      // Create freeze record
      const freeze: EconomyFreeze = {
        _id: input.userId,
        userId: input.userId,
        status: newStatus,
        reason: input.reason,
        frozenAt: new Date(),
        expiresAt,
        frozenBy: input.moderatorId,
        correlationId,
      };

      // Save freeze record
      const freezeResult = await economyModerationRepo.setFreeze(freeze);
      if (freezeResult.isErr()) {
        return ErrResult(freezeResult.error);
      }

      // Update user account status
      await UserStore.patch(input.userId, {
        economyAccount: {
          ...user.economyAccount,
          status: newStatus,
          updatedAt: new Date(),
        },
      } as any);

      // Create audit entry
      await economyAuditRepo.create({
        operationType: "currency_adjust",
        actorId: input.moderatorId,
        targetId: input.userId,
        guildId: input.guildId,
        source: "economy_moderation",
        reason: `Account frozen: ${input.reason}`,
        metadata: {
          correlationId,
          action: "freeze",
          previousStatus,
          newStatus,
          hours: input.hours,
          expiresAt: expiresAt?.toISOString(),
        },
      });

      return OkResult({
        success: true,
        userId: input.userId,
        previousStatus,
        newStatus,
        expiresAt,
        correlationId,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("[EconomyModerationService] Failed to freeze account:", error);
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async unfreeze(input: UnfreezeAccountInput): Promise<Result<FreezeOperationResult, Error>> {
    try {
      // Get user
      const userResult = await UserStore.get(input.userId);
      if (userResult.isErr()) {
        return ErrResult(userResult.error);
      }
      const user = userResult.unwrap();
      if (!user) {
        return ErrResult(new Error("User not found"));
      }

      // Get current freeze info
      const freezeResult = await economyModerationRepo.getFreeze(input.userId);
      if (freezeResult.isErr()) {
        return ErrResult(freezeResult.error);
      }

      const previousStatus = user.economyAccount?.status ?? "ok";
      const newStatus: AccountStatus = "ok";
      const correlationId = generateCorrelationId("unfreeze");

      // Remove freeze record
      await economyModerationRepo.removeFreeze(input.userId);

      // Update user account status
      await UserStore.patch(input.userId, {
        economyAccount: {
          ...user.economyAccount,
          status: newStatus,
          updatedAt: new Date(),
        },
      } as any);

      // Create audit entry
      await economyAuditRepo.create({
        operationType: "currency_adjust",
        actorId: input.moderatorId,
        targetId: input.userId,
        guildId: input.guildId,
        source: "economy_moderation",
        reason: `Account unfrozen: ${input.reason ?? "Moderator action"}`,
        metadata: {
          correlationId,
          action: "unfreeze",
          previousStatus,
          newStatus,
        },
      });

      return OkResult({
        success: true,
        userId: input.userId,
        previousStatus,
        newStatus,
        expiresAt: null,
        correlationId,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("[EconomyModerationService] Failed to unfreeze account:", error);
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async isFrozen(userId: UserId): Promise<Result<{ frozen: boolean; expiresAt: Date | null; reason: string | null }, Error>> {
    try {
      const freezeResult = await economyModerationRepo.getFreeze(userId);
      if (freezeResult.isErr()) {
        return ErrResult(freezeResult.error);
      }

      const freeze = freezeResult.unwrap();
      const frozen = isAccountFrozen(freeze);

      return OkResult({
        frozen,
        expiresAt: freeze?.expiresAt ?? null,
        reason: freeze?.reason ?? null,
      });
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async peek(userId: UserId): Promise<Result<EconomyPeekResult, Error>> {
    try {
      // Get user data
      const userResult = await UserStore.get(userId);
      if (userResult.isErr()) {
        return ErrResult(userResult.error);
      }
      const user = userResult.unwrap();
      if (!user) {
        return ErrResult(new Error("User not found"));
      }

      // Get freeze info
      const freezeResult = await economyModerationRepo.getFreeze(userId);
      const freeze = freezeResult.isOk() ? freezeResult.unwrap() : null;
      const isFrozen = isAccountFrozen(freeze);

      // Get recent audit entries
      const auditResult = await economyAuditRepo.query({
        targetId: userId,
        pageSize: DEFAULT_AUDIT_LIMIT,
      });
      const recentAudit = auditResult.isOk() ? auditResult.unwrap().entries : [];

      // Calculate days since activity
      const lastActivity = user.economyAccount?.lastActivityAt ?? new Date();
      const daysSinceActivity = Math.floor(
        (Date.now() - lastActivity.getTime()) / (24 * 60 * 60 * 1000),
      );

      return OkResult({
        userId,
        account: {
          status: user.economyAccount?.status ?? "ok",
          frozenUntil: freeze?.expiresAt ?? null,
          createdAt: user.economyAccount?.createdAt ?? new Date(),
          lastActivityAt: lastActivity,
        },
        balances: user.currency ?? {},
        recentAudit,
        flags: {
          isOptedOut: user.votingPrefs?.optOut ?? false,
          hasActiveCooldowns: false, // Would check minigame state
          isFrozen,
          daysSinceActivity,
        },
      });
    } catch (error) {
      console.error("[EconomyModerationService] Failed to peek user:", error);
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async queryAudit(
    query: ModerationAuditQuery,
  ): Promise<Result<import("../audit/types").AuditQueryResult, Error>> {
    try {
      const limit = Math.min(
        Math.max(1, query.limit ?? DEFAULT_AUDIT_LIMIT),
        MAX_AUDIT_LIMIT,
      );

      const fromDate = query.sinceDays
        ? new Date(Date.now() - query.sinceDays * 24 * 60 * 60 * 1000)
        : undefined;

      return economyAuditRepo.query({
        targetId: query.targetId,
        actorId: query.moderatorId,
        fromDate,
        pageSize: limit,
        correlationId: query.correlationId,
      });
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  validateFreezeHours(hours: number | null): { valid: boolean; error?: string } {
    if (hours === null) {
      return { valid: true }; // Indefinite is valid
    }

    if (!Number.isInteger(hours) || hours < 1) {
      return { valid: false, error: "Hours must be a positive integer" };
    }

    if (hours > MAX_FREEZE_HOURS) {
      return {
        valid: false,
        error: `Maximum freeze duration is ${MAX_FREEZE_HOURS} hours (30 days)`,
      };
    }

    return { valid: true };
  }
}

/** Singleton instance. */
export const economyModerationService = new EconomyModerationService();
