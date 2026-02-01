/**
 * Store Service.
 *
 * Purpose: Handle buy/sell transactions with capacity checks, tax, and guild liquidity.
 * Encaje: Orchestrates between StoreRepo, CurrencyMutationService, ItemMutationService,
 * GuildEconomyService, and Audit logging.
 */

import { UserStore } from "@/db/repositories/users";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { ItemId } from "@/modules/inventory/definitions";
import type { ItemInventory } from "@/modules/inventory/inventory";
import {
  simulateCapacityAfterAdd,
  type CapacityLimits,
} from "@/modules/inventory/capacity";
import { getItemDefinition } from "@/modules/inventory/items";
import type { GuildId } from "@/db/types";
import { economyAuditRepo } from "../audit/repository";
import { currencyMutationService } from "../mutations/service";
import { itemMutationService } from "../mutations/items/service";
import { guildEconomyService } from "../guild/service";
import { guildEconomyRepo } from "../guild/repository";
import type { EconomySector } from "../guild/types";
import { perkService } from "../perks/service";
import { storeRepo } from "./repository";
import {
  type StoreCatalog,
  type StoreItem,
  type BuyItemInput,
  type BuyItemResult,
  type SellItemInput,
  type SellItemResult,
  type StockCheckResult,
  type PriceCalculation,
  StoreError,
  checkStock,
  calculatePriceWithTax,
  calculateSellPrice,
} from "./types";
import { storeRotationService } from "./rotation/service";
import type { FeaturedItem } from "./rotation/types";

export interface StoreService {
  /**
   * Get store catalog for a guild.
   */
  getCatalog(guildId: GuildId): Promise<Result<StoreCatalog, Error>>;

  /**
   * Check if an item is in stock.
   */
  checkItemStock(
    guildId: GuildId,
    itemId: ItemId,
    quantity: number,
  ): Promise<Result<StockCheckResult, Error>>;

  /**
   * Calculate purchase price for an item.
   */
  calculatePurchasePrice(
    guildId: GuildId,
    itemId: ItemId,
    quantity: number,
  ): Promise<Result<PriceCalculation & { featuredItem?: FeaturedItem }, Error>>;

  /**
   * Buy an item from the store.
   * Coordinates: stock check, capacity check, payment, item grant, audit.
   */
  buyItem(input: BuyItemInput): Promise<Result<BuyItemResult, Error>>;

  /**
   * Sell an item to the store.
   * Coordinates: inventory check, guild liquidity check, item removal, payment, audit.
   */
  sellItem(input: SellItemInput): Promise<Result<SellItemResult, Error>>;

  /**
   * Get sell price for an item (for display).
   */
  getSellPrice(
    guildId: GuildId,
    itemId: ItemId,
  ): Promise<Result<number, Error>>;

  /**
   * List available items in the store.
   */
  listAvailableItems(guildId: GuildId): Promise<Result<StoreItem[], Error>>;

  /**
   * Get featured items with rotation check (Phase 9d).
   */
  getFeaturedItems(guildId: GuildId): Promise<Result<FeaturedItem[], Error>>;
}

class StoreServiceImpl implements StoreService {
  async getCatalog(guildId: GuildId): Promise<Result<StoreCatalog, Error>> {
    return storeRepo.ensure(guildId);
  }

  async checkItemStock(
    guildId: GuildId,
    itemId: ItemId,
    quantity: number,
  ): Promise<Result<StockCheckResult, Error>> {
    const catalogResult = await storeRepo.findByGuildId(guildId);
    if (catalogResult.isErr()) {
      return ErrResult(catalogResult.error);
    }

    const catalog = catalogResult.unwrap();
    if (!catalog) {
      return ErrResult(new StoreError("STORE_CLOSED", "Store not found"));
    }

    if (!catalog.active) {
      return ErrResult(
        new StoreError("STORE_CLOSED", "Store is currently closed"),
      );
    }

    const item = catalog.items[itemId];
    if (!item) {
      return ErrResult(
        new StoreError("ITEM_NOT_FOUND", "Item not found in store"),
      );
    }

    if (!item.available) {
      return ErrResult(
        new StoreError(
          "ITEM_NOT_AVAILABLE",
          "Item is not available for purchase",
        ),
      );
    }

    return OkResult(checkStock(item.stock, quantity));
  }

  async calculatePurchasePrice(
    guildId: GuildId,
    itemId: ItemId,
    quantity: number,
  ): Promise<Result<PriceCalculation & { featuredItem?: FeaturedItem }, Error>> {
    const catalogResult = await storeRepo.findByGuildId(guildId);
    if (catalogResult.isErr()) {
      return ErrResult(catalogResult.error);
    }

    const catalog = catalogResult.unwrap();
    if (!catalog) {
      return ErrResult(new StoreError("STORE_CLOSED", "Store not found"));
    }

    const item = catalog.items[itemId];
    if (!item) {
      return ErrResult(
        new StoreError("ITEM_NOT_FOUND", "Item not found in store"),
      );
    }

    // Check for featured pricing (Phase 9d)
    const featuredResult = await storeRotationService.getFeaturedPrice(guildId, itemId);
    let unitPrice = item.buyPrice;
    let featuredItem: FeaturedItem | undefined;

    if (featuredResult.isOk() && featuredResult.unwrap()) {
      const featured = featuredResult.unwrap()!;
      unitPrice = featured.price;
      featuredItem = featured.item;
    }

    return OkResult({
      ...calculatePriceWithTax(unitPrice, quantity, catalog.taxRate),
      featuredItem,
    });
  }

  async buyItem(input: BuyItemInput): Promise<Result<BuyItemResult, Error>> {
    const { buyerId, guildId, itemId, quantity, reason } = input;

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return ErrResult(
        new StoreError("INVALID_QUANTITY", "Quantity must be positive"),
      );
    }

    // Check guild feature flag
    const guildConfigResult = await guildEconomyRepo.findByGuildId(guildId);
    if (guildConfigResult.isOk()) {
      const guildConfig = guildConfigResult.unwrap();
      if (guildConfig && !guildConfig.features.store) {
        return ErrResult(
          new StoreError(
            "FEATURE_DISABLED",
            "Store está deshabilitado en este servidor.",
          ),
        );
      }
    }

    const transactionId = `store_buy_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // Step 1: Get catalog and validate item
    const catalogResult = await storeRepo.findByGuildId(guildId);
    if (catalogResult.isErr()) {
      return ErrResult(catalogResult.error);
    }

    const catalog = catalogResult.unwrap();
    if (!catalog) {
      return ErrResult(new StoreError("STORE_CLOSED", "Store not found"));
    }

    if (!catalog.active) {
      return ErrResult(
        new StoreError("STORE_CLOSED", "Store is currently closed"),
      );
    }

    const item = catalog.items[itemId];
    if (!item) {
      return ErrResult(
        new StoreError("ITEM_NOT_FOUND", "Item not found in store"),
      );
    }

    if (!item.available) {
      return ErrResult(
        new StoreError(
          "ITEM_NOT_AVAILABLE",
          "Item is not available for purchase",
        ),
      );
    }

    // Step 2: Check stock
    const stockCheck = checkStock(item.stock, quantity);
    if (!stockCheck.available) {
      return ErrResult(
        new StoreError("INSUFFICIENT_STOCK", `Only ${item.stock} available`),
      );
    }

    // Step 3: Calculate price (with featured item discount if applicable - Phase 9d)
    let unitPrice = item.buyPrice;
    let featuredItem: FeaturedItem | undefined;
    
    const featuredResult = await storeRotationService.getFeaturedPrice(guildId, itemId);
    if (featuredResult.isOk() && featuredResult.unwrap()) {
      const featured = featuredResult.unwrap()!;
      unitPrice = featured.price;
      featuredItem = featured.item;
    }

    const pricing = calculatePriceWithTax(
      unitPrice,
      quantity,
      catalog.taxRate,
    );

    // Step 4: Check buyer's inventory capacity
    const userResult = await UserStore.get(buyerId);
    if (userResult.isErr() || !userResult.unwrap()) {
      return ErrResult(
        new StoreError("TRANSACTION_FAILED", "Could not access user inventory"),
      );
    }

    const inventory = (userResult.unwrap()!.inventory ?? {}) as ItemInventory;
    let limits: CapacityLimits | undefined;
    const limitsResult = await perkService.getCapacityLimits(guildId, buyerId);
    if (limitsResult.isOk()) {
      limits = limitsResult.unwrap();
    }

    const capacityCheck = simulateCapacityAfterAdd(
      inventory,
      itemId,
      quantity,
      {
        ignoreUnknownItem: true,
        limits,
      },
    );

    if (capacityCheck.weightExceeded) {
      return ErrResult(
        new StoreError(
          "CAPACITY_EXCEEDED",
          "This would exceed your inventory weight limit",
        ),
      );
    }
    if (capacityCheck.slotsExceeded) {
      return ErrResult(
        new StoreError(
          "CAPACITY_EXCEEDED",
          "This would exceed your inventory slot limit",
        ),
      );
    }

    // Step 5: Process payment (deduct from buyer)
    // Use transfer to guild's trade sector
    const tradeSector: EconomySector = "trade";

    const paymentResult = await currencyMutationService.transferCurrency({
      senderId: buyerId,
      recipientId: guildId, // Guild acts as recipient
      guildId,
      currencyId: catalog.currencyId,
      amount: pricing.total,
      reason: reason || `Buy ${quantity}x ${item.name}`,
      correlationId: transactionId,
    });

    if (paymentResult.isErr()) {
      const error = paymentResult.error;
      if (error.code === "INSUFFICIENT_FUNDS") {
        return ErrResult(
          new StoreError("INSUFFICIENT_FUNDS", "You don't have enough funds"),
        );
      }
      return ErrResult(new StoreError("TRANSACTION_FAILED", error.message));
    }

    // Step 6: Deposit to guild trade sector
    const depositResult = await guildEconomyService.depositToSector({
      guildId,
      sector: tradeSector,
      amount: pricing.subtotal, // Without tax goes to trade
      source: "store_purchase",
      reason: `Purchase of ${quantity}x ${item.name} by ${buyerId}`,
    });

    if (depositResult.isErr()) {
      // This shouldn't fail, but if it does, don't fail the purchase
      console.error(
        "[StoreService] Failed to deposit to guild sector:",
        depositResult.error,
      );
    }

    // Step 7: Decrement stock (if limited)
    let remainingStock = item.stock;
    if (item.stock >= 0) {
      const stockResult = await storeRepo.decrementStock(
        guildId,
        itemId,
        quantity,
      );
      if (stockResult.isOk() && stockResult.unwrap()) {
        remainingStock = stockResult.unwrap()!.items[itemId]?.stock ?? 0;
      }
    }

    // Step 8: Grant items to buyer
    // Use a permission bypass since this is a system operation
    const itemResult = await itemMutationService.adjustItemQuantity(
      {
        actorId: "system", // System actor
        targetId: buyerId,
        guildId,
        itemId,
        delta: quantity,
        reason: `Purchased from store: ${quantity}x ${item.name}`,
        force: true, // Bypass capacity since we already checked
      },
      async () => true, // Bypass permission check
    );

    if (itemResult.isErr()) {
      // This is bad - we took payment but couldn't grant items
      // Try to refund (best effort)
      console.error(
        "[StoreService] Failed to grant items, attempting refund:",
        itemResult.error,
      );

      await currencyMutationService.transferCurrency({
        senderId: guildId,
        recipientId: buyerId,
        guildId,
        currencyId: catalog.currencyId,
        amount: pricing.total,
        reason: `Refund for failed purchase: ${quantity}x ${item.name}`,
      });

      return ErrResult(
        new StoreError(
          "TRANSACTION_FAILED",
          "Failed to grant items. Refund issued.",
        ),
      );
    }

    // Step 9: Create audit entry (with featured item metadata - Phase 9d)
    const auditMetadata: Record<string, unknown> = {
      transactionId,
      correlationId: transactionId,
      unitPrice: unitPrice,
      originalPrice: item.buyPrice,
      totalPrice: pricing.subtotal,
      tax: pricing.tax,
      totalPaid: pricing.total,
      sector: tradeSector,
      sectorDelta: pricing.subtotal,
      stockDelta: item.stock >= 0 ? -quantity : 0,
      isFeatured: !!featuredItem,
    };

    if (featuredItem) {
      auditMetadata.featuredSlotType = featuredItem.slotType;
      auditMetadata.featuredDiscountPct = featuredItem.discountPct;
      auditMetadata.scarcityMarkupPct = featuredItem.scarcityMarkupPct;
      auditMetadata.savings = (item.buyPrice - unitPrice) * quantity;
      
      // Record featured purchase
      await storeRotationService.recordFeaturedPurchase(guildId, itemId);
    }

    await economyAuditRepo.create({
      operationType: "item_purchase",
      actorId: buyerId,
      targetId: buyerId,
      guildId,
      source: "store",
      reason: reason || `Buy ${quantity}x ${item.name}`,
      itemData: {
        itemId,
        quantity,
        beforeQuantity: itemResult.unwrap().beforeQuantity,
        afterQuantity: itemResult.unwrap().afterQuantity,
      },
      metadata: auditMetadata,
    });

    // Step 10: Return result
    return OkResult({
      transactionId,
      buyerId,
      guildId,
      itemId,
      quantity,
      unitPrice,
      totalPrice: pricing.subtotal,
      tax: pricing.tax,
      totalPaid: pricing.total,
      remainingStock,
      timestamp: new Date(),
      capacity: {
        currentWeight: capacityCheck.currentWeight,
        maxWeight: capacityCheck.maxWeight,
        currentSlots: capacityCheck.currentSlots,
        maxSlots: capacityCheck.maxSlots,
      },
    });
  }

  async sellItem(input: SellItemInput): Promise<Result<SellItemResult, Error>> {
    const { sellerId, guildId, itemId, quantity, reason } = input;

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return ErrResult(
        new StoreError("INVALID_QUANTITY", "Quantity must be positive"),
      );
    }

    // Check guild feature flag
    const guildConfigResult = await guildEconomyRepo.findByGuildId(guildId);
    if (guildConfigResult.isOk()) {
      const guildConfig = guildConfigResult.unwrap();
      if (guildConfig && !guildConfig.features.store) {
        return ErrResult(
          new StoreError(
            "FEATURE_DISABLED",
            "Store está deshabilitado en este servidor.",
          ),
        );
      }
    }

    const transactionId = `store_sell_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // Step 1: Get catalog
    const catalogResult = await storeRepo.findByGuildId(guildId);
    if (catalogResult.isErr()) {
      return ErrResult(catalogResult.error);
    }

    const catalog = catalogResult.unwrap();
    if (!catalog) {
      return ErrResult(new StoreError("STORE_CLOSED", "Store not found"));
    }

    if (!catalog.active) {
      return ErrResult(
        new StoreError("STORE_CLOSED", "Store is currently closed"),
      );
    }

    // Step 2: Get item definition
    const itemDef = getItemDefinition(itemId);
    if (!itemDef) {
      return ErrResult(new StoreError("ITEM_NOT_FOUND", "Item not recognized"));
    }

    // Step 3: Get store item (for pricing) or use default pricing
    const storeItem = catalog.items[itemId];
    const sellPrice =
      storeItem?.sellPrice ?? calculateSellPrice(itemDef.value ?? 1);

    // Step 4: Check seller's inventory
    const userResult = await UserStore.get(sellerId);
    if (userResult.isErr() || !userResult.unwrap()) {
      return ErrResult(
        new StoreError("TRANSACTION_FAILED", "Could not access user inventory"),
      );
    }

    const inventory = (userResult.unwrap()!.inventory ?? {}) as ItemInventory;
    const currentQty = inventory[itemId]?.quantity ?? 0;

    if (currentQty < quantity) {
      return ErrResult(
        new StoreError(
          "INSUFFICIENT_INVENTORY",
          `You only have ${currentQty} of this item`,
        ),
      );
    }

    // Step 5: Calculate sale value
    const baseValue = sellPrice * quantity;

    // Apply tax on sale (seller pays tax)
    const taxResult = await guildEconomyService.applyTax(
      guildId,
      "store_sell",
      baseValue,
      {
        depositToGuild: true,
        source: "store_sell",
      },
    );

    let tax = 0;
    let totalReceived = baseValue;

    if (taxResult.isOk()) {
      tax = taxResult.unwrap().tax;
      totalReceived = taxResult.unwrap().net;
    }

    // Step 6: Check guild liquidity (trade sector must have enough)
    const liquidityResult = await guildEconomyService.getSectorBalance(
      guildId,
      "trade",
    );
    if (liquidityResult.isErr()) {
      return ErrResult(
        new StoreError("TRANSACTION_FAILED", "Could not check guild liquidity"),
      );
    }

    const guildLiquidity = liquidityResult.unwrap();
    if (guildLiquidity < totalReceived) {
      return ErrResult(
        new StoreError(
          "GUILD_LIQUIDITY_INSUFFICIENT",
          "The store cannot afford to buy this item right now",
        ),
      );
    }

    // Step 7: Remove items from seller
    const itemResult = await itemMutationService.adjustItemQuantity(
      {
        actorId: "system",
        targetId: sellerId,
        guildId,
        itemId,
        delta: -quantity,
        reason: `Sold to store: ${quantity}x ${itemDef.name}`,
      },
      async () => true,
    );

    if (itemResult.isErr()) {
      return ErrResult(
        new StoreError(
          "TRANSACTION_FAILED",
          "Failed to remove items from inventory",
        ),
      );
    }

    // Step 8: Withdraw from guild trade sector
    const withdrawResult = await guildEconomyService.withdrawFromSector({
      guildId,
      sector: "trade",
      amount: totalReceived,
      source: "store_purchase",
      reason: `Purchase of ${quantity}x ${itemDef.name} from ${sellerId}`,
    });

    if (withdrawResult.isErr()) {
      // This is bad - we took items but guild doesn't have funds
      // Try to return items (best effort)
      console.error(
        "[StoreService] Guild liquidity insufficient, returning items:",
        withdrawResult.error,
      );

      await itemMutationService.adjustItemQuantity(
        {
          actorId: "system",
          targetId: sellerId,
          guildId,
          itemId,
          delta: quantity,
          reason: `Refund for failed sale: ${quantity}x ${itemDef.name}`,
          force: true,
        },
        async () => true,
      );

      return ErrResult(
        new StoreError(
          "GUILD_LIQUIDITY_INSUFFICIENT",
          "The store cannot afford to buy this item right now",
        ),
      );
    }

    // Step 9: Pay seller
    const paymentResult = await currencyMutationService.transferCurrency({
      senderId: guildId,
      recipientId: sellerId,
      guildId,
      currencyId: catalog.currencyId,
      amount: totalReceived,
      reason: reason || `Sold ${quantity}x ${itemDef.name} to store`,
      correlationId: transactionId,
    });

    if (paymentResult.isErr()) {
      // This is really bad - we took items and guild funds but couldn't pay seller
      // Log for manual resolution
      console.error(
        "[StoreService] CRITICAL: Failed to pay seller after taking items and guild funds:",
        {
          sellerId,
          guildId,
          itemId,
          quantity,
          totalReceived,
          error: paymentResult.error,
        },
      );

      return ErrResult(
        new StoreError(
          "TRANSACTION_FAILED",
          "Transaction failed. Please contact an administrator.",
        ),
      );
    }

    // Step 10: Increment store stock
    await storeRepo.updateStock(
      guildId,
      itemId,
      (storeItem?.stock ?? 0) + quantity,
    );

    // Step 11: Create audit entry
    await economyAuditRepo.create({
      operationType: "item_sell",
      actorId: sellerId,
      targetId: sellerId,
      guildId,
      source: "store",
      reason: reason || `Sell ${quantity}x ${itemDef.name}`,
      itemData: {
        itemId,
        quantity,
        beforeQuantity: itemResult.unwrap().beforeQuantity,
        afterQuantity: itemResult.unwrap().afterQuantity,
      },
      metadata: {
        transactionId,
        correlationId: transactionId,
        unitPrice: sellPrice,
        baseValue,
        tax,
        totalReceived,
        sector: "trade",
        sectorDelta: -totalReceived,
        stockDelta: quantity,
      },
    });

    // Step 12: Return result
    return OkResult({
      transactionId,
      sellerId,
      guildId,
      itemId,
      quantity,
      unitPrice: sellPrice,
      baseValue,
      tax,
      totalReceived,
      guildLiquidityUsed: totalReceived,
      timestamp: new Date(),
    });
  }

  async getSellPrice(
    guildId: GuildId,
    itemId: ItemId,
  ): Promise<Result<number, Error>> {
    const catalogResult = await storeRepo.findByGuildId(guildId);
    if (catalogResult.isErr()) {
      return ErrResult(catalogResult.error);
    }

    const catalog = catalogResult.unwrap();
    const storeItem = catalog?.items[itemId];

    if (storeItem) {
      return OkResult(storeItem.sellPrice);
    }

    // Fall back to item definition value
    const itemDef = getItemDefinition(itemId);
    if (!itemDef) {
      return ErrResult(new StoreError("ITEM_NOT_FOUND", "Item not found"));
    }

    return OkResult(calculateSellPrice(itemDef.value ?? 1));
  }

  async listAvailableItems(
    guildId: GuildId,
  ): Promise<Result<StoreItem[], Error>> {
    const catalogResult = await storeRepo.findByGuildId(guildId);
    if (catalogResult.isErr()) {
      return ErrResult(catalogResult.error);
    }

    const catalog = catalogResult.unwrap();
    if (!catalog || !catalog.active) {
      return OkResult([]);
    }

    const items = Object.values(catalog.items).filter((item) => item.available);
    return OkResult(items);
  }

  async getFeaturedItems(
    guildId: GuildId,
  ): Promise<Result<FeaturedItem[], Error>> {
    return storeRotationService.getFeatured(guildId);
  }
}

/** Singleton instance. */
export const storeService: StoreService = new StoreServiceImpl();
