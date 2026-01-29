/**
 * Store Types.
 *
 * Purpose: Define store catalog, transactions, and pricing rules.
 */

import type { ItemId as InventoryItemId } from "@/modules/inventory/definitions";

// Re-export for consumers
export type ItemId = InventoryItemId;
import type { CurrencyId } from "../currency";
import type { GuildId } from "@/db/types";
import type { UserId } from "@/db/types";

/** Store item with pricing and stock. */
export interface StoreItem {
  /** Item ID reference. */
  readonly itemId: ItemId;
  /** Display name (defaults to item definition name). */
  readonly name: string;
  /** Base price for purchase. */
  readonly buyPrice: number;
  /** Sell price (typically ~85% of base). */
  readonly sellPrice: number;
  /** Current stock (-1 for unlimited). */
  readonly stock: number;
  /** Whether item is available for purchase. */
  readonly available: boolean;
  /** Optional description override. */
  readonly description?: string;
  /** Category for grouping items. */
  readonly category?: string;
  /** Purchase limit per user (0 = unlimited). */
  readonly purchaseLimit?: number;
  /** Required role/key to purchase. */
  readonly requiredRole?: string;
}

/** Store catalog for a guild. */
export interface StoreCatalog {
  readonly guildId: GuildId;
  /** Currency used for transactions. */
  readonly currencyId: CurrencyId;
  /** Items available in the store. */
  readonly items: Record<ItemId, StoreItem>;
  /** Whether the store is active. */
  readonly active: boolean;
  /** Tax rate for store transactions (0-1). */
  readonly taxRate: number;
  /** Last updated timestamp. */
  readonly updatedAt: Date;
  /** Version for optimistic concurrency. */
  readonly version: number;
}

/** Default store configuration. */
export const DEFAULT_STORE_CONFIG = {
  currencyId: "coin" as CurrencyId,
  taxRate: 0.05,
  active: true,
};

/** Buy transaction input. */
export interface BuyItemInput {
  /** Buyer user ID. */
  readonly buyerId: UserId;
  /** Guild ID for the store. */
  readonly guildId: GuildId;
  /** Item to purchase. */
  readonly itemId: ItemId;
  /** Quantity to buy. */
  readonly quantity: number;
  /** Optional reason/notes. */
  readonly reason?: string;
}

/** Sell transaction input. */
export interface SellItemInput {
  /** Seller user ID. */
  readonly sellerId: UserId;
  /** Guild ID for the store. */
  readonly guildId: GuildId;
  /** Item to sell. */
  readonly itemId: ItemId;
  /** Quantity to sell. */
  readonly quantity: number;
  /** Optional reason/notes. */
  readonly reason?: string;
}

/** Result of a buy transaction. */
export interface BuyItemResult {
  readonly transactionId: string;
  readonly buyerId: UserId;
  readonly guildId: GuildId;
  readonly itemId: ItemId;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly totalPrice: number;
  readonly tax: number;
  readonly totalPaid: number;
  readonly remainingStock: number;
  readonly timestamp: Date;
  /** Updated capacity after purchase. */
  readonly capacity: {
    currentWeight: number;
    maxWeight: number;
    currentSlots: number;
    maxSlots: number;
  };
}

/** Result of a sell transaction. */
export interface SellItemResult {
  readonly transactionId: string;
  readonly sellerId: UserId;
  readonly guildId: GuildId;
  readonly itemId: ItemId;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly baseValue: number;
  readonly tax: number;
  readonly totalReceived: number;
  readonly guildLiquidityUsed: number;
  readonly timestamp: Date;
}

/** Pricing configuration for an item. */
export interface ItemPricing {
  readonly baseValue: number;
  readonly buyMultiplier: number; // Typically 1.0 (base price)
  readonly sellMultiplier: number; // Typically 0.85 (85% of base)
}

/** Error codes for store operations. */
export type StoreErrorCode =
  | "STORE_CLOSED"
  | "ITEM_NOT_FOUND"
  | "ITEM_NOT_AVAILABLE"
  | "INSUFFICIENT_STOCK"
  | "INSUFFICIENT_FUNDS"
  | "INSUFFICIENT_INVENTORY"
  | "CAPACITY_EXCEEDED"
  | "GUILD_LIQUIDITY_INSUFFICIENT"
  | "PURCHASE_LIMIT_REACHED"
  | "REQUIRED_ROLE_MISSING"
  | "INVALID_QUANTITY"
  | "INVALID_PRICE"
  | "TRANSACTION_FAILED";

/** Error class for store operations. */
export class StoreError extends Error {
  constructor(
    public readonly code: StoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

/** Stock check result. */
export interface StockCheckResult {
  readonly available: boolean;
  readonly requested: number;
  readonly availableStock: number;
  readonly unlimited: boolean;
}

/** Price calculation result. */
export interface PriceCalculation {
  readonly unitPrice: number;
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
  readonly taxRate: number;
}

/** Store transaction audit data. */
export interface StoreTransactionAudit {
  readonly transactionId: string;
  readonly type: "buy" | "sell";
  readonly userId: UserId;
  readonly guildId: GuildId;
  readonly itemId: ItemId;
  readonly quantity: number;
  readonly price: number;
  readonly tax: number;
  readonly total: number;
  readonly timestamp: Date;
}

/** Calculate sell price from base value. */
export function calculateSellPrice(baseValue: number, sellMultiplier = 0.85): number {
  return Math.max(1, Math.floor(baseValue * sellMultiplier));
}

/** Calculate buy price with optional markup. */
export function calculateBuyPrice(baseValue: number, buyMultiplier = 1.0): number {
  return Math.max(1, Math.floor(baseValue * buyMultiplier));
}

/** Calculate price with tax. */
export function calculatePriceWithTax(
  basePrice: number,
  quantity: number,
  taxRate: number,
): PriceCalculation {
  const subtotal = basePrice * quantity;
  const tax = Math.floor(subtotal * taxRate);
  const total = subtotal + tax;

  return {
    unitPrice: basePrice,
    subtotal,
    tax,
    total,
    taxRate,
  };
}

/** Check if stock is sufficient. */
export function checkStock(
  stock: number,
  requested: number,
): StockCheckResult {
  const unlimited = stock < 0;
  return {
    available: unlimited || stock >= requested,
    requested,
    availableStock: unlimited ? Infinity : stock,
    unlimited,
  };
}

/** Build default store catalog for a guild. */
export function buildDefaultCatalog(guildId: GuildId): StoreCatalog {
  return {
    guildId,
    currencyId: DEFAULT_STORE_CONFIG.currencyId,
    items: {},
    active: true,
    taxRate: DEFAULT_STORE_CONFIG.taxRate,
    updatedAt: new Date(),
    version: 0,
  };
}
