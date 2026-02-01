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

      // Only match when cooldown expired (or never claimed). Upsert creates doc when none exists.
      const result = await col.findOneAndUpdate(
        {
          _id: docId,
          $or: [
            { lastClaimAt: { $exists: false } },
            { lastClaimAt: { $lt: cutoff } },
          ],
        } as any,
        [
          {
            $replaceRoot: {
              newRoot: {
                $cond: [
                  { $ne: [{ $ifNull: ["$_id", null] }, null] },
                  "$$ROOT",
                  { _id: docId, guildId, userId },
                ],
              },
            },
          },
          {
            $set: {
              lastClaimAt: now,
              lastClaimDayStamp: dayStamp,
              currentStreak: {
                $let: {
                  vars: {
                    prevDay: { $ifNull: ["$lastClaimDayStamp", 0] },
                    prevStreak: { $ifNull: ["$currentStreak", 0] },
                  },
                  in: {
                    $cond: [
                      { $eq: ["$$prevDay", dayStamp] },
                      "$$prevStreak",
                      {
                        $cond: [
                          { $eq: ["$$prevDay", dayStamp - 1] },
                          { $add: ["$$prevStreak", 1] },
                          1,
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
          {
            $set: {
              bestStreak: {
                $max: [{ $ifNull: ["$bestStreak", 0] }, "$currentStreak"],
              },
              guildId,
              userId,
            },
          },
        ],
        { upsert: true, returnDocument: "before", includeResultMetadata: true },
      );

      // If we got a doc back, we matched and updated (or inserted) -> claim granted.
      const beforeDoc = (result as any)?.value ?? null;
      const upserted = Boolean((result as any)?.lastErrorObject?.upserted);

      if (!beforeDoc && !upserted) {
        return OkResult({ granted: false });
      }

      const before = DailyClaimSchema.safeParse(beforeDoc);
      const beforeRecord = before.success
        ? before.data
        : ({
            _id: docId,
            guildId,
            userId,
            lastClaimAt: new Date(0),
            lastClaimDayStamp: 0,
            currentStreak: 0,
            bestStreak: 0,
          } as DailyClaimRecord);

      const streakBefore = Math.max(
        0,
        Math.trunc(beforeRecord.currentStreak ?? 0),
      );
      const prevDayStamp = Math.trunc(beforeRecord.lastClaimDayStamp ?? 0);
      const streakAfter = computeNextStreak(
        prevDayStamp,
        streakBefore,
        dayStamp,
      );
      const bestStreakAfter = Math.max(
        Math.trunc(beforeRecord.bestStreak ?? 0),
        streakAfter,
      );

      return OkResult({
        granted: true,
        streakBefore,
        streakAfter,
        bestStreakAfter,
        lastClaimDayStamp: dayStamp,
        dayStamp,
      });
    } catch (error) {
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
