/**
 * Work Claim Repository.
 *
 * Purpose: Atomic cooldown + daily cap per (guildId, userId) for /work claims.
 * Encaje: MongoDB collection economy_work_claims; findOneAndUpdate for concurrency safety.
 */

import { z } from "zod";
import { MongoStore } from "@/db/mongo-store";
import type { GuildId, UserId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";

/** Stored document for a user's work claims in a guild. */
export interface WorkClaimRecord {
  readonly _id: string;
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly lastWorkAt: Date;
  readonly workCountToday: number;
  readonly dayStamp: string;
}

export interface WorkClaimOutcome {
  readonly granted: boolean;
  readonly record: WorkClaimRecord | null;
  readonly remainingToday: number;
  readonly reason?: "cooldown" | "cap" | "unknown";
  readonly cooldownEndsAt?: Date;
}

const WorkClaimSchema = z.object({
  _id: z.string(),
  guildId: z.string(),
  userId: z.string(),
  lastWorkAt: z.coerce.date(),
  workCountToday: z.number().int().catch(0),
  dayStamp: z.string().catch(""),
});

const WorkClaimStore = new MongoStore<WorkClaimRecord>(
  "economy_work_claims",
  WorkClaimSchema as z.ZodType<WorkClaimRecord>,
);

const getDayStamp = (date: Date) => date.toISOString().slice(0, 10);

export interface WorkClaimRepo {
  /**
   * Try to claim work: set lastWorkAt to now and increment daily count only if
   * cooldown has expired and daily cap not exceeded.
   */
  tryClaim(
    guildId: GuildId,
    userId: UserId,
    cooldownMinutes: number,
    dailyCap: number,
  ): Promise<Result<WorkClaimOutcome, Error>>;
}

class WorkClaimRepoImpl implements WorkClaimRepo {
  async tryClaim(
    guildId: GuildId,
    userId: UserId,
    cooldownMinutes: number,
    dailyCap: number,
  ): Promise<Result<WorkClaimOutcome, Error>> {
    const now = new Date();
    const dayStamp = getDayStamp(now);
    const cap = Math.max(0, dailyCap);
    const cooldownMs = Math.max(0, cooldownMinutes) * 60 * 1000;
    const cutoff = new Date(now.getTime() - cooldownMs);

    if (cap === 0) {
      return OkResult({
        granted: false,
        record: null,
        remainingToday: 0,
        reason: "cap",
      });
    }

    try {
      const col = await WorkClaimStore.collection();
      const docId = `${guildId}:${userId}`;

      const result = await col.findOneAndUpdate(
        {
          _id: docId,
          $and: [
            {
              $or: [
                { lastWorkAt: { $exists: false } },
                { lastWorkAt: { $lt: cutoff } },
              ],
            },
            {
              $or: [
                { dayStamp: { $ne: dayStamp } },
                { dayStamp: { $exists: false } },
                { workCountToday: { $lt: cap } },
              ],
            },
          ],
        } as any,
        [
          {
            $set: {
              _id: docId,
              guildId,
              userId,
              dayStamp,
              lastWorkAt: now,
              workCountToday: {
                $cond: [
                  { $eq: ["$dayStamp", dayStamp] },
                  { $add: [{ $ifNull: ["$workCountToday", 0] }, 1] },
                  1,
                ],
              },
            },
          },
        ] as any,
        { upsert: true, returnDocument: "after" },
      );

      if (result) {
        const parsed = WorkClaimSchema.safeParse(result);
        const record = parsed.success ? parsed.data : null;
        const remainingToday =
          record && record.dayStamp === dayStamp
            ? Math.max(0, cap - record.workCountToday)
            : cap;
        return OkResult({
          granted: true,
          record,
          remainingToday,
        });
      }

      const existing = await col.findOne({ _id: docId } as any);
      const parsed = existing ? WorkClaimSchema.safeParse(existing) : null;
      const record = parsed && parsed.success ? parsed.data : null;

      let reason: WorkClaimOutcome["reason"] = "unknown";
      let cooldownEndsAt: Date | undefined;
      if (record) {
        if (record.lastWorkAt && record.lastWorkAt >= cutoff) {
          reason = "cooldown";
          cooldownEndsAt = new Date(record.lastWorkAt.getTime() + cooldownMs);
        } else if (
          record.dayStamp === dayStamp &&
          record.workCountToday >= cap
        ) {
          reason = "cap";
        }
      }

      const remainingToday =
        record && record.dayStamp === dayStamp
          ? Math.max(0, cap - record.workCountToday)
          : cap;

      return OkResult({
        granted: false,
        record,
        remainingToday,
        reason,
        cooldownEndsAt,
      });
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}

export const workClaimRepo: WorkClaimRepo = new WorkClaimRepoImpl();
