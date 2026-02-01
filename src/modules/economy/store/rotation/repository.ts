/**
 * Store Rotation Repository (Phase 9d).
 *
 * Purpose: Persist and retrieve store rotation state per guild.
 */

import { z } from "zod";
import { GuildStore } from "@/db/repositories/guilds";
import type { GuildId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type {
  StoreRotation,
  StoreRotationConfig,
} from "./types";
import { buildDefaultRotation, DEFAULT_ROTATION_CONFIG } from "./types";

/** Zod schema for featured item. */
const FeaturedItemSchema = z.object({
  itemId: z.string(),
  slotType: z.enum(["daily", "legendary"]),
  slotIndex: z.number(),
  featuredPrice: z.number(),
  originalPrice: z.number(),
  discountPct: z.number(),
  scarcityMarkupPct: z.number(),
  featuredStock: z.number(),
  featuredAt: z.date().or(z.string().transform((s) => new Date(s))),
  expiresAt: z.date().or(z.string().transform((s) => new Date(s))),
  purchaseCount: z.number().default(0),
});

/** Zod schema for rotation config. */
const RotationConfigSchema = z.object({
  mode: z.enum(["manual", "auto", "disabled"]).catch("auto"),
  dailyFeaturedCount: z.number().min(1).max(10).catch(5),
  hasLegendarySlot: z.boolean().catch(true),
  featuredDiscountPct: z.number().min(0).max(1).catch(0.15),
  scarcityMarkupPct: z.number().min(0).max(2).catch(0.25),
  scarcityThreshold: z.number().min(1).catch(10),
  rotationHours: z.number().min(1).max(168).catch(24),
  rotationOnAccess: z.boolean().catch(true),
  rotationTimeUtc: z.string().optional(),
});

/** Zod schema for rotation data. */
const RotationDataSchema = z.object({
  featured: z.array(FeaturedItemSchema).catch(() => []),
  lastRotationAt: z.date().or(z.string().transform((s) => new Date(s))).catch(() => new Date()),
  nextRotationAt: z.date().or(z.string().transform((s) => new Date(s))).catch(() => new Date()),
  config: RotationConfigSchema.catch(() => DEFAULT_ROTATION_CONFIG),
  version: z.number().catch(0),
});

export type RotationData = z.infer<typeof RotationDataSchema>;

/** Convert DB data to domain model. */
function toDomain(guildId: string, data: RotationData): StoreRotation {
  return {
    guildId,
    featured: data.featured.map((f) => ({
      ...f,
      featuredAt: new Date(f.featuredAt),
      expiresAt: new Date(f.expiresAt),
    })),
    lastRotationAt: new Date(data.lastRotationAt),
    nextRotationAt: new Date(data.nextRotationAt),
    config: data.config,
    version: data.version,
  };
}

/** Build DB data from domain model. */
function toData(rotation: StoreRotation): RotationData {
  return {
    featured: rotation.featured,
    lastRotationAt: rotation.lastRotationAt,
    nextRotationAt: rotation.nextRotationAt,
    config: rotation.config,
    version: rotation.version,
  };
}

export interface StoreRotationRepo {
  /**
   * Find rotation state for a guild.
   */
  findByGuildId(guildId: GuildId): Promise<Result<StoreRotation | null, Error>>;

  /**
   * Ensure rotation state exists, creating with defaults if needed.
   */
  ensure(guildId: GuildId): Promise<Result<StoreRotation, Error>>;

  /**
   * Save rotation state.
   */
  save(
    guildId: GuildId,
    rotation: StoreRotation,
  ): Promise<Result<StoreRotation, Error>>;

  /**
   * Update rotation configuration.
   */
  updateConfig(
    guildId: GuildId,
    config: Partial<StoreRotationConfig>,
  ): Promise<Result<StoreRotation, Error>>;

  /**
   * Increment purchase count for a featured item.
   */
  incrementPurchaseCount(
    guildId: GuildId,
    itemId: string,
  ): Promise<Result<StoreRotation | null, Error>>;
}

class StoreRotationRepoImpl implements StoreRotationRepo {
  async findByGuildId(
    guildId: GuildId,
  ): Promise<Result<StoreRotation | null, Error>> {
    const guildResult = await GuildStore.get(guildId);
    if (guildResult.isErr()) {
      return ErrResult(guildResult.error);
    }

    const guild = guildResult.unwrap();
    if (!guild) {
      return OkResult(null);
    }

    const raw = (guild as any).storeRotation;
    if (!raw) {
      return OkResult(null);
    }

    const parsed = RotationDataSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(
        `[StoreRotationRepo] Invalid rotation data for guild ${guildId}, using defaults`,
      );
      return OkResult(buildDefaultRotation(guildId));
    }

    return OkResult(toDomain(guildId, parsed.data));
  }

  async ensure(guildId: GuildId): Promise<Result<StoreRotation, Error>> {
    const existing = await this.findByGuildId(guildId);
    if (existing.isErr()) {
      return ErrResult(existing.error);
    }

    if (existing.unwrap()) {
      return OkResult(existing.unwrap()!);
    }

    // Create new rotation with defaults
    const defaults = buildDefaultRotation(guildId);

    try {
      const col = await GuildStore.collection();
      const now = new Date();

      await col.updateOne(
        { _id: guildId } as any,
        {
          $set: {
            storeRotation: toData(defaults),
            updatedAt: now,
          },
        } as any,
        { upsert: false },
      );

      return OkResult(defaults);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async save(
    guildId: GuildId,
    rotation: StoreRotation,
  ): Promise<Result<StoreRotation, Error>> {
    try {
      const col = await GuildStore.collection();
      const now = new Date();

      await col.updateOne(
        { _id: guildId } as any,
        {
          $set: {
            storeRotation: toData(rotation),
            updatedAt: now,
          },
        } as any,
        { upsert: false },
      );

      return OkResult(rotation);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async updateConfig(
    guildId: GuildId,
    config: Partial<StoreRotationConfig>,
  ): Promise<Result<StoreRotation, Error>> {
    const ensureResult = await this.ensure(guildId);
    if (ensureResult.isErr()) {
      return ErrResult(ensureResult.error);
    }

    const current = ensureResult.unwrap();
    const newConfig = { ...current.config, ...config };

    const updated: StoreRotation = {
      ...current,
      config: newConfig,
      version: current.version + 1,
    };

    return this.save(guildId, updated);
  }

  async incrementPurchaseCount(
    guildId: GuildId,
    itemId: string,
  ): Promise<Result<StoreRotation | null, Error>> {
    try {
      const col = await GuildStore.collection();
      const now = new Date();

      const result = await col.findOneAndUpdate(
        {
          _id: guildId,
          "storeRotation.featured.itemId": itemId,
        } as any,
        {
          $inc: { "storeRotation.featured.$.purchaseCount": 1 } as any,
          $set: { updatedAt: now },
        } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return OkResult(null);
      }

      const raw = (result as any).storeRotation;
      return OkResult(toDomain(guildId, raw));
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}

/** Singleton instance. */
export const storeRotationRepo: StoreRotationRepo = new StoreRotationRepoImpl();
