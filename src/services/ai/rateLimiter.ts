/**
 * Motivacion: gestionar rate limit por usuario para peticiones de IA por guild.
 *
 * Idea/concepto: similar a RoleRateLimiter, mantiene buckets en memoria con TTL (ventana deslizante).
 *
 * Alcance: gestiona el límite de consumo persistiendo el estado en MongoDB.
 */

import { getDb } from "@/db/mongo";

interface BucketDocument {
  _id: string; // guildId:userId
  count: number;
  resetAt: number;
}

export interface ConsumeResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export class AiRateLimiter {
  private async getCollection() {
    return (await getDb()).collection<BucketDocument>("ai_rate_limits");
  }

  async consume(
    guildId: string,
    userId: string,
    maxUses: number,
    windowSeconds: number,
  ): Promise<ConsumeResult> {
    const key = `${guildId}:${userId}`;
    const windowMs = windowSeconds * 1000;
    const now = Date.now();
    const col = await this.getCollection();

    // Clean up expired buckets before checking (or rely on TTL index)
    // We use a single atomic operation:
    // - find the bucket for this user
    // - if it's expired, reset it
    // - increment if not at limit

    // First, let's try to find an active bucket
    const existing = await col.findOne({ _id: key });

    if (existing && now < existing.resetAt) {
      if (existing.count >= maxUses) {
        console.log(
          `[ai-rate-limit] blocked guild=${guildId} user=${userId} count=${existing.count} max=${maxUses}`,
        );
        return { allowed: false, remaining: 0, resetAt: existing.resetAt };
      }

      const res = await col.findOneAndUpdate(
        { _id: key, resetAt: existing.resetAt }, // ensure window hasn't changed
        { $inc: { count: 1 } },
        { returnDocument: "after" },
      );

      if (!res) {
        // Raced with a reset? Retry once.
        return this.consume(guildId, userId, maxUses, windowSeconds);
      }

      return {
        allowed: true,
        remaining: Math.max(0, maxUses - res.count),
        resetAt: res.resetAt,
      };
    }

    // New window or expired window
    const resetAt = now + windowMs;
    const res = await col.findOneAndUpdate(
      { _id: key },
      {
        $set: { count: 1, resetAt },
      },
      { upsert: true, returnDocument: "after" },
    );

    const count = res?.count ?? 1;
    const finalResetAt = res?.resetAt ?? resetAt;

    console.log(
      `[ai-rate-limit] consume(new) guild=${guildId} user=${userId} remaining=${maxUses - count}`,
    );

    return {
      allowed: true,
      remaining: Math.max(0, maxUses - count),
      resetAt: finalResetAt,
    };
  }

  /**
   * Note: It is recommended to create a TTL index in MongoDB:
   * db.ai_rate_limits.createIndex({ "resetAt": 1 }, { expireAfterSeconds: 0 })
   */
}

export const aiRateLimiter = new AiRateLimiter();
