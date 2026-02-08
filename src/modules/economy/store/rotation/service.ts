/**
 * Store Rotation Service (Phase 9d).
 *
 * Purpose: Manage featured item rotation, pricing, and selection logic.
 */

import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { GuildId } from "@/db/types";
import type { ItemId } from "../types";
import { storeRepo } from "../repository";
import { storeRotationRepo } from "./repository";
import type {
  StoreRotation,
  FeaturedItem,
  RotateFeaturedInput,
  RotationResult,
  StoreRotationConfig,
} from "./types";
import {
  calculateFeaturedPrice,
  isRotationDue,
} from "./types";

/** Seeded random number generator for consistent rotation per day. */
function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
}

/** Generate date seed for consistent daily rotation. */
function getDateSeed(guildId: string, date: Date): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return `${guildId}:${year}-${month}-${day}`;
}

/** Fisher-Yates shuffle with seeded random. */
function seededShuffle<T>(array: T[], seed: string): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(`${seed}:${i}`) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class StoreRotationService {
  async getFeatured(guildId: GuildId): Promise<Result<FeaturedItem[], Error>> {
    // Check if rotation is needed
    const rotationResult = await this.checkAndRotate(guildId);
    if (rotationResult.isErr()) {
      return ErrResult(rotationResult.error);
    }

    const rotation = rotationResult.unwrap();
    return OkResult(rotation.featured);
  }

  async getRotation(guildId: GuildId): Promise<Result<StoreRotation, Error>> {
    const rotationResult = await storeRotationRepo.ensure(guildId);
    if (rotationResult.isErr()) {
      return ErrResult(rotationResult.error);
    }

    return OkResult(rotationResult.unwrap());
  }

  async rotateFeatured(
    input: RotateFeaturedInput,
  ): Promise<Result<RotationResult, Error>> {
    const { guildId, force, manualSelection } = input;

    // Get current rotation state
    const rotationResult = await storeRotationRepo.ensure(guildId);
    if (rotationResult.isErr()) {
      return ErrResult(rotationResult.error);
    }

    const currentRotation = rotationResult.unwrap();

    // Check if rotation is due (unless forced)
    const isDue = isRotationDue(currentRotation.nextRotationAt, currentRotation.config.mode);
    if (!force && !isDue) {
      return OkResult({
        success: true,
        previousFeatured: currentRotation.featured,
        newFeatured: currentRotation.featured,
        rotatedAt: new Date(),
        nextRotationAt: currentRotation.nextRotationAt,
        wasDue: false,
      });
    }

    // Get store catalog to select from
    const catalogResult = await storeRepo.findByGuildId(guildId);
    if (catalogResult.isErr()) {
      return ErrResult(catalogResult.error);
    }

    const catalog = catalogResult.unwrap();
    if (!catalog) {
      return ErrResult(new Error("Store not found"));
    }

    const config = currentRotation.config;
    const availableItems = Object.values(catalog.items).filter(
      (item) => item.available,
    );

    if (availableItems.length === 0) {
      return ErrResult(new Error("No available items in store"));
    }

    // Calculate next rotation time
    const now = new Date();
    const nextRotationAt = new Date(
      now.getTime() + config.rotationHours * 60 * 60 * 1000,
    );

    // Select featured items
    const newFeatured: FeaturedItem[] = [];
    const seed = getDateSeed(guildId, now);

    if (manualSelection && manualSelection.length > 0) {
      // Manual selection mode
      for (let i = 0; i < manualSelection.length; i++) {
        const itemId = manualSelection[i];
        const storeItem = catalog.items[itemId];
        if (!storeItem || !storeItem.available) continue;

        const { price, appliedScarcity } = calculateFeaturedPrice(
          storeItem.buyPrice,
          config.featuredDiscountPct,
          config.scarcityMarkupPct,
          storeItem.stock,
          config.scarcityThreshold,
        );

        newFeatured.push({
          itemId,
          slotType: i === 0 && config.hasLegendarySlot ? "legendary" : "daily",
          slotIndex: i,
          featuredPrice: price,
          originalPrice: storeItem.buyPrice,
          discountPct: config.featuredDiscountPct,
          scarcityMarkupPct: appliedScarcity,
          featuredStock: storeItem.stock,
          featuredAt: now,
          expiresAt: nextRotationAt,
          purchaseCount: 0,
        });
      }
    } else {
      // Auto selection mode
      const shuffled = seededShuffle(availableItems, seed);
      const totalSlots =
        config.dailyFeaturedCount + (config.hasLegendarySlot ? 1 : 0);
      const selected = shuffled.slice(0, totalSlots);

      for (let i = 0; i < selected.length; i++) {
        const storeItem = selected[i];
        const isLegendary = i === 0 && config.hasLegendarySlot;

        // Apply extra discount for legendary slot
        const discount = isLegendary
          ? Math.min(0.5, config.featuredDiscountPct * 2) // Double discount for legendary, max 50%
          : config.featuredDiscountPct;

        const { price, appliedScarcity } = calculateFeaturedPrice(
          storeItem.buyPrice,
          discount,
          config.scarcityMarkupPct,
          storeItem.stock,
          config.scarcityThreshold,
        );

        newFeatured.push({
          itemId: storeItem.itemId,
          slotType: isLegendary ? "legendary" : "daily",
          slotIndex: isLegendary ? 0 : i - (config.hasLegendarySlot ? 1 : 0),
          featuredPrice: price,
          originalPrice: storeItem.buyPrice,
          discountPct: discount,
          scarcityMarkupPct: appliedScarcity,
          featuredStock: storeItem.stock,
          featuredAt: now,
          expiresAt: nextRotationAt,
          purchaseCount: 0,
        });
      }
    }

    // Build new rotation state
    const newRotation: StoreRotation = {
      ...currentRotation,
      featured: newFeatured,
      lastRotationAt: now,
      nextRotationAt,
      version: currentRotation.version + 1,
    };

    // Save rotation
    const saveResult = await storeRotationRepo.save(guildId, newRotation);
    if (saveResult.isErr()) {
      return ErrResult(saveResult.error);
    }

    return OkResult({
      success: true,
      previousFeatured: currentRotation.featured,
      newFeatured,
      rotatedAt: now,
      nextRotationAt,
      wasDue: true,
    });
  }

  async updateConfig(
    guildId: GuildId,
    config: Partial<StoreRotationConfig>,
  ): Promise<Result<StoreRotation, Error>> {
    return storeRotationRepo.updateConfig(guildId, config);
  }

  async getFeaturedPrice(
    guildId: GuildId,
    itemId: ItemId,
  ): Promise<Result<{ price: number; item: FeaturedItem } | null, Error>> {
    const featuredResult = await this.getFeatured(guildId);
    if (featuredResult.isErr()) {
      return ErrResult(featuredResult.error);
    }

    const featured = featuredResult.unwrap();
    const item = featured.find((f) => f.itemId === itemId);

    if (!item) {
      return OkResult(null);
    }

    return OkResult({ price: item.featuredPrice, item });
  }

  async recordFeaturedPurchase(
    guildId: GuildId,
    itemId: ItemId,
  ): Promise<Result<void, Error>> {
    const result = await storeRotationRepo.incrementPurchaseCount(guildId, itemId);
    if (result.isErr()) {
      return ErrResult(result.error);
    }
    return OkResult(undefined);
  }

  /** Internal: Check if rotation is needed and perform it. */
  private async checkAndRotate(
    guildId: GuildId,
  ): Promise<Result<StoreRotation, Error>> {
    // Ensure rotation exists
    const rotationResult = await storeRotationRepo.ensure(guildId);
    if (rotationResult.isErr()) {
      return ErrResult(rotationResult.error);
    }

    const rotation = rotationResult.unwrap();

    // Check if rotation is due
    if (!isRotationDue(rotation.nextRotationAt, rotation.config.mode)) {
      return OkResult(rotation);
    }

    // Perform rotation
    const rotateResult = await this.rotateFeatured({ guildId });
    if (rotateResult.isErr()) {
      return ErrResult(new Error(String(rotateResult.err)));
    }

    // Get updated rotation
    const updatedResult = await storeRotationRepo.findByGuildId(guildId);
    if (updatedResult.isErr()) {
      return ErrResult(new Error(String(updatedResult.err)));
    }
    const updated = updatedResult.unwrap();
    if (!updated) {
      return ErrResult(new Error("Failed to get updated rotation"));
    }

    return OkResult(updated);
  }
}

/** Singleton instance. */
export const storeRotationService = new StoreRotationService();
