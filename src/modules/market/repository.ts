/**
 * Marketplace repository.
 *
 * Purpose: Persist and query market listings with CAS-safe updates.
 */

import { getDb } from "@/db/mongo";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { ClientSession, Collection, Sort } from "mongodb";
import type { GuildId, UserId } from "@/db/types";
import type { ItemId } from "@/modules/inventory/definitions";
import { MarketListingSchema, repairMarketListing, type MarketListingDoc } from "./schema";
import type { MarketCategory, MarketListingStatus } from "./types";

const COLLECTION_NAME = "market_listings";

export interface MarketIndexEntryDoc {
  readonly itemId: ItemId;
  readonly listingCount: number;
  readonly cheapestPrice: number;
}

export interface MarketRepository {
  collection(): Promise<Collection<MarketListingDoc>>;
  ensureIndexes(): Promise<void>;
  create(
    listing: MarketListingDoc,
    options?: { session?: ClientSession },
  ): Promise<Result<MarketListingDoc, Error>>;
  findById(
    listingId: string,
    options?: { session?: ClientSession },
  ): Promise<Result<MarketListingDoc | null, Error>>;
  countActiveBySeller(
    guildId: GuildId,
    sellerId: UserId,
    options?: { session?: ClientSession },
  ): Promise<Result<number, Error>>;
  listActiveBySeller(
    guildId: GuildId,
    sellerId: UserId,
    page: number,
    pageSize: number,
  ): Promise<Result<MarketListingDoc[], Error>>;
  listActiveByItem(
    guildId: GuildId,
    itemId: ItemId,
    page: number,
    pageSize: number,
  ): Promise<Result<MarketListingDoc[], Error>>;
  aggregateItemIndex(
    guildId: GuildId,
    itemIds?: readonly ItemId[],
    category?: MarketCategory,
  ): Promise<Result<MarketIndexEntryDoc[], Error>>;
  decrementEscrow(
    listingId: string,
    quantity: number,
    options?: { session?: ClientSession; expectedVersion?: number },
  ): Promise<Result<MarketListingDoc | null, Error>>;
  cancelActive(
    listingId: string,
    options?: { session?: ClientSession },
  ): Promise<Result<MarketListingDoc | null, Error>>;
  updateById(
    listingId: string,
    patch: Partial<MarketListingDoc>,
    options?: { session?: ClientSession },
  ): Promise<Result<MarketListingDoc | null, Error>>;
}

function parseListing(doc: unknown): MarketListingDoc {
  const parsed = MarketListingSchema.safeParse(doc);
  if (parsed.success) return parsed.data;
  console.warn("[MarketRepository] Invalid listing document detected, repairing.");
  return repairMarketListing(doc);
}

class MarketRepositoryImpl implements MarketRepository {
  async collection(): Promise<Collection<MarketListingDoc>> {
    const db = await getDb();
    return db.collection<MarketListingDoc>(COLLECTION_NAME);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.collection();

    await col.createIndex(
      { guildId: 1, itemId: 1, pricePerUnit: 1, createdAt: 1 },
      { name: "guild_item_price_created_idx" },
    );
    await col.createIndex(
      { guildId: 1, sellerId: 1, status: 1, createdAt: -1 },
      { name: "guild_seller_status_created_idx" },
    );
    await col.createIndex(
      { guildId: 1, status: 1, createdAt: -1 },
      { name: "guild_status_created_idx" },
    );
    await col.createIndex(
      { expiresAt: 1 },
      {
        name: "expires_at_ttl_idx",
        expireAfterSeconds: 0,
        partialFilterExpression: { expiresAt: { $type: "date" } },
      },
    );
  }

  async create(
    listing: MarketListingDoc,
    options?: { session?: ClientSession },
  ): Promise<Result<MarketListingDoc, Error>> {
    try {
      const col = await this.collection();
      await col.insertOne(listing as any, { session: options?.session });
      return OkResult(listing);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findById(
    listingId: string,
    options?: { session?: ClientSession },
  ): Promise<Result<MarketListingDoc | null, Error>> {
    try {
      const col = await this.collection();
      const doc = await col.findOne({ _id: listingId } as any, {
        session: options?.session,
      });
      return OkResult(doc ? parseListing(doc) : null);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async countActiveBySeller(
    guildId: GuildId,
    sellerId: UserId,
    options?: { session?: ClientSession },
  ): Promise<Result<number, Error>> {
    try {
      const col = await this.collection();
      const count = await col.countDocuments(
        {
          guildId,
          sellerId,
          status: "active",
        } as any,
        { session: options?.session },
      );
      return OkResult(count);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async listActiveBySeller(
    guildId: GuildId,
    sellerId: UserId,
    page: number,
    pageSize: number,
  ): Promise<Result<MarketListingDoc[], Error>> {
    try {
      const col = await this.collection();
      const skip = Math.max(0, page) * Math.max(1, pageSize);
      const docs = await col
        .find({
          guildId,
          sellerId,
          status: "active",
        } as any)
        .sort({ createdAt: -1 } as Sort)
        .skip(skip)
        .limit(Math.max(1, pageSize))
        .toArray();

      return OkResult(docs.map(parseListing));
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async listActiveByItem(
    guildId: GuildId,
    itemId: ItemId,
    page: number,
    pageSize: number,
  ): Promise<Result<MarketListingDoc[], Error>> {
    try {
      const col = await this.collection();
      const skip = Math.max(0, page) * Math.max(1, pageSize);
      const docs = await col
        .find({
          guildId,
          itemId,
          status: "active",
          quantity: { $gt: 0 },
        } as any)
        .sort({ pricePerUnit: 1, createdAt: 1 } as Sort)
        .skip(skip)
        .limit(Math.max(1, pageSize))
        .toArray();

      return OkResult(docs.map(parseListing));
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async aggregateItemIndex(
    guildId: GuildId,
    itemIds?: readonly ItemId[],
    category?: MarketCategory,
  ): Promise<Result<MarketIndexEntryDoc[], Error>> {
    try {
      const col = await this.collection();
      const match: Record<string, unknown> = {
        guildId,
        status: "active",
        quantity: { $gt: 0 },
      };
      if (itemIds && itemIds.length > 0) {
        match.itemId = { $in: [...itemIds] };
      }
      if (category) {
        match.category = category;
      }

      const rows = await col
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: "$itemId",
              listingCount: { $sum: 1 },
              cheapestPrice: { $min: "$pricePerUnit" },
            },
          },
          { $sort: { cheapestPrice: 1, _id: 1 } },
        ])
        .toArray();

      return OkResult(
        rows.map((row) => ({
          itemId: String((row as any)._id),
          listingCount: Number((row as any).listingCount ?? 0),
          cheapestPrice: Number((row as any).cheapestPrice ?? 0),
        })),
      );
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async decrementEscrow(
    listingId: string,
    quantity: number,
    options?: { session?: ClientSession; expectedVersion?: number },
  ): Promise<Result<MarketListingDoc | null, Error>> {
    try {
      const col = await this.collection();
      const now = new Date();

      const filter: Record<string, unknown> = {
        _id: listingId,
        status: "active",
        quantity: { $gte: quantity },
      };
      if (typeof options?.expectedVersion === "number") {
        filter.version = options.expectedVersion;
      }

      const doc = await col.findOneAndUpdate(
        filter as any,
        [
          {
            $set: {
              quantity: { $subtract: ["$quantity", quantity] },
              updatedAt: now,
              version: { $add: ["$version", 1] },
            },
          },
          {
            $set: {
              status: {
                $cond: [{ $lte: ["$quantity", 0] }, "sold_out", "$status"],
              },
            },
          },
        ] as any,
        { returnDocument: "after", session: options?.session },
      );

      return OkResult(doc ? parseListing(doc) : null);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async cancelActive(
    listingId: string,
    options?: { session?: ClientSession },
  ): Promise<Result<MarketListingDoc | null, Error>> {
    try {
      const col = await this.collection();
      const now = new Date();
      const doc = await col.findOneAndUpdate(
        {
          _id: listingId,
          status: "active",
        } as any,
        {
          $set: {
            status: "cancelled" satisfies MarketListingStatus,
            updatedAt: now,
          },
          $inc: { version: 1 } as any,
        } as any,
        { returnDocument: "after", session: options?.session },
      );

      return OkResult(doc ? parseListing(doc) : null);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async updateById(
    listingId: string,
    patch: Partial<MarketListingDoc>,
    options?: { session?: ClientSession },
  ): Promise<Result<MarketListingDoc | null, Error>> {
    try {
      const col = await this.collection();
      const doc = await col.findOneAndUpdate(
        { _id: listingId } as any,
        {
          $set: {
            ...patch,
            updatedAt: new Date(),
          } as any,
          $inc: { version: 1 } as any,
        } as any,
        { returnDocument: "after", session: options?.session },
      );

      return OkResult(doc ? parseListing(doc) : null);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export const marketRepository: MarketRepository = new MarketRepositoryImpl();
