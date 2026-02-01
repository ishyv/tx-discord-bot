/**
 * Economy Moderation Repository.
 *
 * Purpose: Store and retrieve freeze records.
 * Context: MongoDB persistence for economy moderation state.
 */

import { z } from "zod";
import { MongoStore } from "@/db/mongo-store";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { UserId } from "@/db/types";
import type { EconomyFreeze } from "./types";

/** Zod schema for freeze record validation. */
const EconomyFreezeSchema = z.object({
  _id: z.string(),
  userId: z.string(),
  status: z.enum(["blocked", "banned"]),
  reason: z.string(),
  frozenAt: z.date(),
  expiresAt: z.date().nullable(),
  frozenBy: z.string(),
  correlationId: z.string(),
});

/** Freeze store singleton. */
const FreezeStore = new MongoStore<EconomyFreeze>("economy_freezes", EconomyFreezeSchema);

/** Repository interface for economy moderation. */
export interface EconomyModerationRepo {
  /** Create or update a freeze record. */
  setFreeze(freeze: EconomyFreeze): Promise<Result<EconomyFreeze, Error>>;

  /** Get active freeze for user. */
  getFreeze(userId: UserId): Promise<Result<EconomyFreeze | null, Error>>;

  /** Remove freeze record (unfreeze). */
  removeFreeze(userId: UserId): Promise<Result<boolean, Error>>;

  /** List all active freezes (for cleanup job). */
  listActiveFreezes(): Promise<Result<EconomyFreeze[], Error>>;

  /** List expired freezes that should be cleaned up. */
  listExpiredFreezes(): Promise<Result<EconomyFreeze[], Error>>;

  /** Clean up expired freeze records. */
  cleanupExpired(): Promise<Result<number, Error>>;
}

class EconomyModerationRepoImpl implements EconomyModerationRepo {
  async setFreeze(freeze: EconomyFreeze): Promise<Result<EconomyFreeze, Error>> {
    try {
      const result = await FreezeStore.set(freeze.userId, freeze);
      if (result.isErr()) return ErrResult(result.error);
      return OkResult(freeze);
    } catch (error) {
      console.error("[EconomyModerationRepo] Failed to set freeze:", error);
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async getFreeze(userId: UserId): Promise<Result<EconomyFreeze | null, Error>> {
    try {
      const result = await FreezeStore.get(userId);
      if (result.isErr()) return ErrResult(result.error);
      return OkResult(result.unwrap());
    } catch (error) {
      console.error("[EconomyModerationRepo] Failed to get freeze:", error);
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async removeFreeze(userId: UserId): Promise<Result<boolean, Error>> {
    try {
      const result = await FreezeStore.delete(userId);
      if (result.isErr()) return ErrResult(result.error);
      return OkResult(result.unwrap());
    } catch (error) {
      console.error("[EconomyModerationRepo] Failed to remove freeze:", error);
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async listActiveFreezes(): Promise<Result<EconomyFreeze[], Error>> {
    try {
      const col = await FreezeStore.collection();
      const now = new Date();
      
      // Active = expiresAt is null OR expiresAt > now
      const freezes = await col.find({
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: now } },
        ],
      } as any).toArray();

      return OkResult(freezes as EconomyFreeze[]);
    } catch (error) {
      console.error("[EconomyModerationRepo] Failed to list active freezes:", error);
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async listExpiredFreezes(): Promise<Result<EconomyFreeze[], Error>> {
    try {
      const col = await FreezeStore.collection();
      const now = new Date();
      
      // Expired = expiresAt is not null AND expiresAt <= now
      const freezes = await col.find({
        expiresAt: { $lte: now },
      } as any).toArray();

      return OkResult(freezes as EconomyFreeze[]);
    } catch (error) {
      console.error("[EconomyModerationRepo] Failed to list expired freezes:", error);
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async cleanupExpired(): Promise<Result<number, Error>> {
    try {
      const col = await FreezeStore.collection();
      const now = new Date();
      
      const result = await col.deleteMany({
        expiresAt: { $lte: now },
      } as any);

      return OkResult(result.deletedCount);
    } catch (error) {
      console.error("[EconomyModerationRepo] Failed to cleanup expired freezes:", error);
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/** Ensure indexes exist for moderation collection. */
export async function ensureModerationIndexes(): Promise<void> {
  try {
    const col = await FreezeStore.collection();
    
    // Index for querying by expiration (for cleanup job)
    await col.createIndex(
      { expiresAt: 1 },
      { name: "expires_at_idx" },
    );

    // Index for querying by frozenBy (moderator)
    await col.createIndex(
      { frozenBy: 1, frozenAt: -1 },
      { name: "moderator_time_idx" },
    );

    console.log("[EconomyModeration] Indexes ensured");
  } catch (error) {
    console.error("[EconomyModeration] Failed to ensure indexes:", error);
  }
}

/** Singleton instance. */
export const economyModerationRepo: EconomyModerationRepo = new EconomyModerationRepoImpl();
