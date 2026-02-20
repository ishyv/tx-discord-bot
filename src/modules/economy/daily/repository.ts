/**
 * Daily Claim Repository.
 *
 * Purpose: Atomic cooldown per (guildId, userId) for /daily claims.
 * Encaje: MongoDB collection economy_daily_claims; findOneAndUpdate for concurrency safety.
 */

import { z } from "zod";
import { MongoStore } from "@/db/mongo-store";
import type { GuildId } from "@/db/types";
import type { UserId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";

/** Stored document for a user's last daily claim in a guild. */
export interface DailyClaimRecord {
  readonly _id: string;
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly lastClaimAt: Date;
  readonly lastClaimDayStamp: number;
  readonly currentStreak: number;
  readonly bestStreak: number;
}

const DailyClaimSchema = z.object({
  _id: z.string(),
  guildId: z.string(),
  userId: z.string(),
  lastClaimAt: z.coerce.date().catch(() => new Date(0)),
  lastClaimDayStamp: z.number().int().catch(0),
  currentStreak: z.number().int().catch(0),
  bestStreak: z.number().int().catch(0),
});

const DailyClaimStore = new MongoStore<DailyClaimRecord>(
  "economy_daily_claims",
  DailyClaimSchema as z.ZodType<DailyClaimRecord>,
);

export interface DailyClaimRepo {
  /**
   * Try to claim daily: set lastClaimAt to now only if cooldown has expired (or never claimed).
   * Returns true if claim was granted (this call won the race); false if cooldown active or lost race.
   */
  tryClaim(
    guildId: GuildId,
    userId: UserId,
    cooldownHours: number,
    nowOverride?: Date,
  ): Promise<Result<DailyClaimAttempt, Error>>;

  /**
   * Get streak status for a user in a guild.
   * Returns 0s if no record exists yet.
   */
  getStatus(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<DailyClaimStatus, Error>>;
}

export interface DailyClaimAttempt {
  readonly granted: boolean;
  readonly streakBefore?: number;
  readonly streakAfter?: number;
  readonly bestStreakAfter?: number;
  readonly lastClaimDayStamp?: number;
  readonly dayStamp?: number;
}

export interface DailyClaimStatus {
  readonly currentStreak: number;
  readonly bestStreak: number;
  readonly lastClaimDayStamp: number | null;
  readonly lastClaimAt: Date | null;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Compute a UTC day stamp (days since Unix epoch).
 * Note: we intentionally use UTC to avoid DST drift and ensure consistency.
 */
function getUtcDayStamp(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      MS_PER_DAY,
  );
}

function computeNextStreak(
  prevDayStamp: number,
  prevStreak: number,
  dayStamp: number,
): number {
  if (prevDayStamp === dayStamp) return prevStreak;
  if (prevDayStamp === dayStamp - 1) return prevStreak + 1;
  return 1;
}

class DailyClaimRepoImpl implements DailyClaimRepo {
  async tryClaim(
    guildId: GuildId,
    userId: UserId,
    cooldownHours: number,
    nowOverride?: Date,
  ): Promise<Result<DailyClaimAttempt, Error>> {
    const now = nowOverride ?? new Date();
    const cutoff = new Date(now.getTime() - cooldownHours * 60 * 60 * 1000);
    const dayStamp = getUtcDayStamp(now);

    try {
      const col = await DailyClaimStore.collection();
      const docId = `${guildId}:${userId}`;

      // Step 1: Read the current doc (if any) to compute streak before committing.
      // This is safe because the actual claim lock is acquired atomically in step 2.
      const existing = await col.findOne({ _id: docId } as any);

      const streakBefore = Math.max(0, Math.trunc((existing as any)?.currentStreak ?? 0));
      const prevDayStamp = Math.trunc((existing as any)?.lastClaimDayStamp ?? 0);
      const streakAfter = computeNextStreak(prevDayStamp, streakBefore, dayStamp);
      const bestStreakAfter = Math.max(
        Math.trunc((existing as any)?.bestStreak ?? 0),
        streakAfter,
      );

      // Step 2: Atomic claim — only matches when cooldown has expired (or doc doesn't exist).
      // Uses a standard update (not aggregation pipeline) so $setOnInsert correctly sets _id on upsert.
      // Aggregation-pipeline upserts do NOT reliably propagate the filter's _id to the new document,
      // causing E11000 duplicate key errors on retry.
      const result = await col.findOneAndUpdate(
        {
          _id: docId,
          $or: [
            { lastClaimAt: { $exists: false } },
            { lastClaimAt: { $lt: cutoff } },
          ],
        } as any,
        {
          $set: {
            lastClaimAt: now,
            lastClaimDayStamp: dayStamp,
            currentStreak: streakAfter,
            bestStreak: bestStreakAfter,
            guildId,
            userId,
          },
        } as any,
        { upsert: true, returnDocument: "before", includeResultMetadata: true },
      );

      // Matched and updated an existing doc → value is the before-doc.
      // Upserted a new doc → value is null but lastErrorObject.upserted is set.
      const matched = (result as any)?.value != null;
      const upserted = Boolean((result as any)?.lastErrorObject?.upserted);

      if (!matched && !upserted) {
        // Filter didn't match → cooldown still active
        return OkResult({ granted: false });
      }

      return OkResult({
        granted: true,
        streakBefore,
        streakAfter,
        bestStreakAfter,
        lastClaimDayStamp: dayStamp,
        dayStamp,
      });
    } catch (error) {
      // E11000: two concurrent first-time claims raced; the other request won.
      // Treat as cooldown-active so the caller shows the normal cooldown message.
      if ((error as any)?.code === 11000) {
        return OkResult({ granted: false });
      }
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async getStatus(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<DailyClaimStatus, Error>> {
    const docId = `${guildId}:${userId}`;
    const recordResult = await DailyClaimStore.get(docId);
    if (recordResult.isErr()) return ErrResult(recordResult.error);

    const record = recordResult.unwrap();
    if (!record) {
      return OkResult({
        currentStreak: 0,
        bestStreak: 0,
        lastClaimDayStamp: null,
        lastClaimAt: null,
      });
    }

    return OkResult({
      currentStreak: Math.max(0, Math.trunc(record.currentStreak ?? 0)),
      bestStreak: Math.max(0, Math.trunc(record.bestStreak ?? 0)),
      lastClaimDayStamp: Number.isFinite(record.lastClaimDayStamp)
        ? Math.trunc(record.lastClaimDayStamp)
        : null,
      lastClaimAt: record.lastClaimAt ?? null,
    });
  }
}

export const dailyClaimRepo: DailyClaimRepo = new DailyClaimRepoImpl();
