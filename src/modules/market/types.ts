/**
 * Marketplace domain types.
 *
 * Purpose: Define listing entities, service contracts, and error model.
 */

import type { GuildId, UserId } from "@/db/types";
import type { ItemId, ItemDefinitionWithUse } from "@/modules/inventory/definitions";
import type { ItemInstance } from "@/modules/inventory/instances";

export const MARKET_CATEGORIES = [
  "materials",
  "consumables",
  "components",
  "gear",
  "tools",
] as const;

export type MarketCategory = (typeof MARKET_CATEGORIES)[number];
export type MarketItemKind = "stackable" | "instance";
export type MarketListingStatus = "active" | "sold_out" | "cancelled" | "expired";

export const MARKET_DEFAULTS = {
  maxActiveListingsPerUser: 20,
  createCooldownMs: 3_000,
  buyCooldownMs: 2_000,
  feeRate: 0.02,
  feeSector: "trade",
  defaultCurrencyId: "coins",
  pageSize: 10,
} as const;

export type MarketCurrencyId = typeof MARKET_DEFAULTS.defaultCurrencyId;

export type MarketItemMetadata = {
  readonly tradable: boolean;
  readonly category: MarketCategory;
  readonly suggestedPrice?: number;
  readonly minPrice?: number;
  readonly maxPrice?: number;
};

export type MarketAwareItemDefinition = ItemDefinitionWithUse & {
  readonly market?: MarketItemMetadata;
};

export interface MarketListing {
  readonly _id: string;
  readonly guildId: GuildId;
  readonly sellerId: UserId;
  readonly itemId: ItemId;
  readonly itemKind: MarketItemKind;
  readonly currencyId: MarketCurrencyId;
  readonly pricePerUnit: number;
  readonly quantity: number;
  readonly instanceIds?: string[];
  readonly escrowInstances?: ItemInstance[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly expiresAt?: Date | null;
  readonly status: MarketListingStatus;
  readonly version: number;
}

export interface MarketBrowseIndexEntry {
  readonly itemId: ItemId;
  readonly category: MarketCategory;
  readonly listingCount: number;
  readonly cheapestPrice: number;
}

export interface MarketListingView {
  readonly listingId: string;
  readonly sellerId: UserId;
  readonly itemId: ItemId;
  readonly itemKind: MarketItemKind;
  readonly pricePerUnit: number;
  readonly quantity: number;
  readonly createdAt: Date;
  readonly instance?: ItemInstance;
}

export interface SellableItemView {
  readonly itemId: ItemId;
  readonly category: MarketCategory;
  readonly itemKind: MarketItemKind;
  readonly quantity: number;
  readonly instances?: ItemInstance[];
  readonly suggestedPrice?: number;
  readonly minPrice?: number;
  readonly maxPrice?: number;
}

export interface ListMarketItemInput {
  readonly guildId: GuildId;
  readonly sellerId: UserId;
  readonly itemId: ItemId;
  readonly quantity: number;
  readonly pricePerUnit: number;
  readonly instanceId?: string;
  readonly expiresAt?: Date | null;
  readonly correlationId?: string;
}

export interface ListMarketItemResult {
  readonly listingId: string;
  readonly guildId: GuildId;
  readonly sellerId: UserId;
  readonly itemId: ItemId;
  readonly itemKind: MarketItemKind;
  readonly quantity: number;
  readonly pricePerUnit: number;
  readonly correlationId: string;
  readonly createdAt: Date;
}

export interface BuyListingInput {
  readonly guildId: GuildId;
  readonly buyerId: UserId;
  readonly listingId: string;
  readonly quantity: number;
  readonly correlationId?: string;
}

export interface BuyListingResult {
  readonly listingId: string;
  readonly guildId: GuildId;
  readonly itemId: ItemId;
  readonly quantity: number;
  readonly subtotal: number;
  readonly tax: number;
  readonly fee: number;
  readonly total: number;
  readonly sellerPayout: number;
  readonly buyerId: UserId;
  readonly sellerId: UserId;
  readonly correlationId: string;
  readonly listingRemaining: number;
}

export interface CancelListingInput {
  readonly guildId: GuildId;
  readonly actorId: UserId;
  readonly listingId: string;
  readonly allowModeratorOverride?: boolean;
  readonly correlationId?: string;
}

export interface CancelListingResult {
  readonly listingId: string;
  readonly guildId: GuildId;
  readonly sellerId: UserId;
  readonly itemId: ItemId;
  readonly returnedQuantity: number;
  readonly correlationId: string;
}

export interface MarketPricing {
  readonly subtotal: number;
  readonly tax: number;
  readonly fee: number;
  readonly total: number;
  readonly sellerPayout: number;
}

export type MarketErrorCode =
  | "FEATURE_DISABLED"
  | "ACCOUNT_BLOCKED"
  | "ACCOUNT_BANNED"
  | "NOT_TRADABLE"
  | "INVALID_CATEGORY"
  | "INVALID_QUANTITY"
  | "INVALID_PRICE"
  | "PRICE_OUT_OF_RANGE"
  | "LISTING_NOT_FOUND"
  | "LISTING_NOT_ACTIVE"
  | "LISTING_LIMIT_REACHED"
  | "INSUFFICIENT_INVENTORY"
  | "INSUFFICIENT_FUNDS"
  | "INSUFFICIENT_LISTING_QUANTITY"
  | "CAPACITY_EXCEEDED"
  | "SELF_BUY_FORBIDDEN"
  | "COOLDOWN_ACTIVE"
  | "PERMISSION_DENIED"
  | "TRANSACTION_FAILED";

export class MarketError extends Error {
  constructor(
    public readonly code: MarketErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MarketError";
  }
}

export function isMarketCategory(value: string): value is MarketCategory {
  return (MARKET_CATEGORIES as readonly string[]).includes(value);
}

export function getMarketMetadata(
  item: ItemDefinitionWithUse | null,
): MarketItemMetadata | null {
  if (!item) return null;
  const candidate = (item as MarketAwareItemDefinition).market;
  if (!candidate || !candidate.tradable) return null;
  if (!isMarketCategory(candidate.category)) return null;
  return candidate;
}

export function categoryLabel(category: MarketCategory): string {
  switch (category) {
    case "materials":
      return "Materials";
    case "consumables":
      return "Consumables";
    case "components":
      return "Components";
    case "gear":
      return "Gear";
    case "tools":
      return "Tools";
    default:
      return category;
  }
}
