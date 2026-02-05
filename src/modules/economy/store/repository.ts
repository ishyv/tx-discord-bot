/**
 * Store Repository.
 *
 * Purpose: Persist and retrieve store catalogs per guild.
 * Encaje: Uses GuildStore for persistence with store subdocument.
 */

import { z } from "zod";
import { GuildStore } from "@/db/repositories/guilds";
import type { GuildId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import {
  type StoreCatalog,
  type StoreItem,
  type ItemId,
  StoreError,
  buildDefaultCatalog,
} from "./types";

import { StoreCatalogDataSchema } from "@/db/schemas/guild";

export type StoreCatalogData = z.infer<typeof StoreCatalogDataSchema>;

/** Convert DB data to domain model. */
function toDomain(guildId: string, data: StoreCatalogData): StoreCatalog {
  return {
    guildId,
    currencyId: data.currencyId,
    items: data.items as Record<ItemId, StoreItem>,
    active: data.active,
    taxRate: data.taxRate,
    updatedAt: data.updatedAt,
    version: data.version,
  };
}

/** Build DB data from domain model. */
function toData(catalog: StoreCatalog): StoreCatalogData {
  return {
    currencyId: catalog.currencyId,
    items: catalog.items,
    active: catalog.active,
    taxRate: catalog.taxRate,
    updatedAt: catalog.updatedAt,
    version: catalog.version,
  };
}

export interface StoreRepo {
  /**
   * Find store catalog for a guild.
   */
  findByGuildId(guildId: GuildId): Promise<Result<StoreCatalog | null, Error>>;

  /**
   * Ensure store catalog exists, creating with defaults if needed.
   */
  ensure(guildId: GuildId): Promise<Result<StoreCatalog, Error>>;

  /**
   * Add or update an item in the catalog.
   */
  upsertItem(
    guildId: GuildId,
    item: StoreItem,
  ): Promise<Result<StoreCatalog, Error>>;

  /**
   * Remove an item from the catalog.
   */
  removeItem(
    guildId: GuildId,
    itemId: ItemId,
  ): Promise<Result<StoreCatalog, Error>>;

  /**
   * Update stock for an item.
   */
  updateStock(
    guildId: GuildId,
    itemId: ItemId,
    newStock: number,
  ): Promise<Result<StoreCatalog, Error>>;

  /**
   * Decrement stock (atomically) for a purchase.
   */
  decrementStock(
    guildId: GuildId,
    itemId: ItemId,
    quantity: number,
  ): Promise<Result<StoreCatalog | null, Error>>;

  /**
   * Toggle store active state.
   */
  setActive(
    guildId: GuildId,
    active: boolean,
  ): Promise<Result<StoreCatalog, Error>>;

  /**
   * Update store configuration.
   */
  updateConfig(
    guildId: GuildId,
    config: {
      currencyId?: string;
      taxRate?: number;
    },
  ): Promise<Result<StoreCatalog, Error>>;
}

class StoreRepoImpl implements StoreRepo {
  async findByGuildId(
    guildId: GuildId,
  ): Promise<Result<StoreCatalog | null, Error>> {
    const guildResult = await GuildStore.get(guildId);
    if (guildResult.isErr()) {
      return ErrResult(guildResult.error);
    }

    const guild = guildResult.unwrap();
    if (!guild) {
      return OkResult(null);
    }

    const raw = (guild as any).store;
    if (!raw) {
      return OkResult(null);
    }

    const parsed = StoreCatalogDataSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(
        `[StoreRepo] Invalid store data for guild ${guildId}, using defaults`,
      );
      return OkResult(buildDefaultCatalog(guildId));
    }

    return OkResult(toDomain(guildId, parsed.data));
  }

  async ensure(guildId: GuildId): Promise<Result<StoreCatalog, Error>> {
    const guildResult = await GuildStore.ensure(guildId);
    if (guildResult.isErr()) {
      return ErrResult(guildResult.error);
    }

    const existing = await this.findByGuildId(guildId);
    if (existing.isErr()) {
      return ErrResult(existing.error);
    }

    if (existing.unwrap()) {
      return OkResult(existing.unwrap()!);
    }

    // Create new catalog with defaults
    const defaults = buildDefaultCatalog(guildId);

    try {
      const col = await GuildStore.collection();
      const now = new Date();

      await col.updateOne(
        { _id: guildId } as any,
        {
          $set: {
            store: toData(defaults),
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

  async upsertItem(
    guildId: GuildId,
    item: StoreItem,
  ): Promise<Result<StoreCatalog, Error>> {
    const ensureResult = await this.ensure(guildId);
    if (ensureResult.isErr()) return ErrResult(ensureResult.error);

    try {
      const col = await GuildStore.collection();
      const now = new Date();

      const result = await col.findOneAndUpdate(
        { _id: guildId } as any,
        {
          $set: {
            [`store.items.${item.itemId}`]: item,
            "store.updatedAt": now,
          },
          $inc: { "store.version": 1 } as any,
        } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return ErrResult(
          new StoreError("TRANSACTION_FAILED", "Failed to update item"),
        );
      }

      const raw = (result as any).store;
      return OkResult(toDomain(guildId, raw));
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async removeItem(
    guildId: GuildId,
    itemId: ItemId,
  ): Promise<Result<StoreCatalog, Error>> {
    const ensureResult = await this.ensure(guildId);
    if (ensureResult.isErr()) return ErrResult(ensureResult.error);

    try {
      const col = await GuildStore.collection();
      const now = new Date();

      const result = await col.findOneAndUpdate(
        { _id: guildId } as any,
        {
          $unset: { [`store.items.${itemId}`]: "" } as any,
          $set: {
            "store.updatedAt": now,
          },
          $inc: { "store.version": 1 } as any,
        } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return ErrResult(
          new StoreError("TRANSACTION_FAILED", "Failed to remove item"),
        );
      }

      const raw = (result as any).store;
      return OkResult(toDomain(guildId, raw));
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async updateStock(
    guildId: GuildId,
    itemId: ItemId,
    newStock: number,
  ): Promise<Result<StoreCatalog, Error>> {
    const ensureResult = await this.ensure(guildId);
    if (ensureResult.isErr()) return ErrResult(ensureResult.error);

    try {
      const col = await GuildStore.collection();
      const now = new Date();

      const result = await col.findOneAndUpdate(
        { _id: guildId } as any,
        {
          $set: {
            [`store.items.${itemId}.stock`]: newStock,
            "store.updatedAt": now,
          },
        } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return ErrResult(
          new StoreError("TRANSACTION_FAILED", "Failed to update stock"),
        );
      }

      const raw = (result as any).store;
      return OkResult(toDomain(guildId, raw));
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async decrementStock(
    guildId: GuildId,
    itemId: ItemId,
    quantity: number,
  ): Promise<Result<StoreCatalog | null, Error>> {
    const catalog = await this.findByGuildId(guildId);
    if (catalog.isErr()) return ErrResult(catalog.error);

    const currentCatalog = catalog.unwrap();
    if (!currentCatalog) {
      return ErrResult(new StoreError("TRANSACTION_FAILED", "Store not found"));
    }

    const item = currentCatalog.items[itemId];
    if (!item) {
      return ErrResult(
        new StoreError("ITEM_NOT_FOUND", "Item not found in store"),
      );
    }

    // Unlimited stock (-1) doesn't need decrement
    if (item.stock < 0) {
      return OkResult(currentCatalog);
    }

    if (item.stock < quantity) {
      return ErrResult(
        new StoreError("INSUFFICIENT_STOCK", "Not enough stock"),
      );
    }

    try {
      const col = await GuildStore.collection();
      const now = new Date();

      const result = await col.findOneAndUpdate(
        {
          _id: guildId,
          [`store.items.${itemId}.stock`]: { $gte: quantity },
        } as any,
        {
          $inc: { [`store.items.${itemId}.stock`]: -quantity } as any,
          $set: {
            "store.updatedAt": now,
          },
        } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return OkResult(null); // Stock changed concurrently
      }

      const raw = (result as any).store;
      return OkResult(toDomain(guildId, raw));
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async setActive(
    guildId: GuildId,
    active: boolean,
  ): Promise<Result<StoreCatalog, Error>> {
    const ensureResult = await this.ensure(guildId);
    if (ensureResult.isErr()) return ErrResult(ensureResult.error);

    try {
      const col = await GuildStore.collection();
      const now = new Date();

      const result = await col.findOneAndUpdate(
        { _id: guildId } as any,
        {
          $set: {
            "store.active": active,
            "store.updatedAt": now,
          },
        } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return ErrResult(
          new StoreError("TRANSACTION_FAILED", "Failed to update store"),
        );
      }

      const raw = (result as any).store;
      return OkResult(toDomain(guildId, raw));
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async updateConfig(
    guildId: GuildId,
    config: { currencyId?: string; taxRate?: number },
  ): Promise<Result<StoreCatalog, Error>> {
    const ensureResult = await this.ensure(guildId);
    if (ensureResult.isErr()) return ErrResult(ensureResult.error);

    const setPaths: Record<string, unknown> = {};

    if (config.currencyId !== undefined) {
      setPaths["store.currencyId"] = config.currencyId;
    }
    if (config.taxRate !== undefined) {
      setPaths["store.taxRate"] = Math.max(0, Math.min(1, config.taxRate));
    }

    if (Object.keys(setPaths).length === 0) {
      return ensureResult;
    }

    setPaths["store.updatedAt"] = new Date();

    try {
      const col = await GuildStore.collection();

      const result = await col.findOneAndUpdate(
        { _id: guildId } as any,
        { $set: setPaths } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return ErrResult(
          new StoreError("TRANSACTION_FAILED", "Failed to update config"),
        );
      }

      const raw = (result as any).store;
      return OkResult(toDomain(guildId, raw));
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}

/** Singleton instance. */
export const storeRepo: StoreRepo = new StoreRepoImpl();
