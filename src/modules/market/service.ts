/**
 * Marketplace service.
 *
 * Purpose: Business logic for listing escrow, browsing, buying, and cancelling.
 */

import { getMongoClient } from "@/db/mongo";
import { GuildStore } from "@/db/repositories/guilds";
import { UserStore } from "@/db/repositories/users";
import type { GuildId, UserId } from "@/db/types";
import { runUserTransition } from "@/db/user-transition";
import { economyAccountRepo } from "@/modules/economy/account/repository";
import { economyAuditRepo } from "@/modules/economy/audit/repository";
import type { CurrencyInventory } from "@/modules/economy/currency";
import { guildEconomyRepo } from "@/modules/economy/guild/repository";
import { currencyEngine } from "@/modules/economy/transactions";
import { simulateModernCapacityAfterAdd } from "@/modules/inventory/capacity";
import type { ItemId } from "@/modules/inventory/definitions";
import { getItemDefinition } from "@/modules/inventory/items";
import {
  addInstances,
  normalizeModernInventory,
  popInstances,
  removeInstanceById,
  type ModernInventory,
} from "@/modules/inventory/inventory";
import type { ItemInstance } from "@/modules/inventory/instances";
import { isInstanceBased } from "@/modules/inventory/instances";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { ClientSession } from "mongodb";
import { marketRepository } from "./repository";
import type { MarketListingDoc } from "./schema";
import {
  MARKET_DEFAULTS,
  type BuyListingInput,
  type BuyListingResult,
  type CancelListingInput,
  type CancelListingResult,
  type ListMarketItemInput,
  type ListMarketItemResult,
  type MarketBrowseIndexEntry,
  type MarketCategory,
  type MarketItemKind,
  type MarketListingView,
  type MarketPricing,
  type SellableItemView,
  MarketError,
  categoryLabel,
  getMarketMetadata,
} from "./types";

const listingCooldown = new Map<UserId, number>();
const buyCooldown = new Map<UserId, number>();

type ListingEscrow =
  | { kind: "stackable"; quantity: number }
  | { kind: "instance"; instances: ItemInstance[] };

export interface MarketService {
  listItem(input: ListMarketItemInput): Promise<Result<ListMarketItemResult, MarketError>>;
  browseIndex(
    guildId: GuildId,
    category?: MarketCategory,
  ): Promise<Result<MarketBrowseIndexEntry[], MarketError>>;
  getListingsForItem(
    guildId: GuildId,
    itemId: ItemId,
    page?: number,
    pageSize?: number,
  ): Promise<Result<MarketListingView[], MarketError>>;
  buyListing(input: BuyListingInput): Promise<Result<BuyListingResult, MarketError>>;
  cancelListing(
    input: CancelListingInput,
  ): Promise<Result<CancelListingResult, MarketError>>;
  getMyListings(
    guildId: GuildId,
    sellerId: UserId,
    page?: number,
    pageSize?: number,
  ): Promise<Result<MarketListingView[], MarketError>>;
  getSellableItems(
    guildId: GuildId,
    userId: UserId,
    category?: MarketCategory,
  ): Promise<Result<SellableItemView[], MarketError>>;
}

const isFiniteInt = (value: number): boolean =>
  Number.isFinite(value) && Number.isInteger(value);

const clampPage = (value: number): number => Math.max(0, Math.trunc(value));

const nowMs = (): number => Date.now();

const isTransactionUnsupported = (error: unknown): boolean => {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("transaction numbers are only allowed") ||
    message.includes("replica set") ||
    message.includes("not supported in this deployment")
  );
};

function checkCooldown(
  map: Map<UserId, number>,
  key: UserId,
  ms: number,
): Result<void, MarketError> {
  const now = nowMs();
  const previous = map.get(key);
  if (previous && now - previous < ms) {
    return ErrResult(
      new MarketError(
        "COOLDOWN_ACTIVE",
        `You must wait ${Math.ceil((ms - (now - previous)) / 1000)}s.`,
      ),
    );
  }
  return OkResult(undefined);
}

function markCooldown(map: Map<UserId, number>, key: UserId): void {
  map.set(key, nowMs());
}

function mapTransactionError(error: Error): MarketError {
  return error instanceof MarketError
    ? error
    : new MarketError("TRANSACTION_FAILED", error.message);
}

function ensurePositiveInt(
  value: number,
  message: string,
): Result<number, MarketError> {
  if (!isFiniteInt(value) || value <= 0) {
    return ErrResult(new MarketError("INVALID_QUANTITY", message));
  }
  return OkResult(Math.trunc(value));
}

function buildCorrelation(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeListingId(): string {
  return `ml_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureTradableItem(
  itemId: ItemId,
  expectedCategory?: MarketCategory,
): Result<
  {
    itemKind: MarketItemKind;
    category: MarketCategory;
    metadata: NonNullable<ReturnType<typeof getMarketMetadata>>;
  },
  MarketError
> {
  const item = getItemDefinition(itemId);
  const metadata = getMarketMetadata(item);
  if (!item || !metadata) {
    return ErrResult(
      new MarketError("NOT_TRADABLE", "This item cannot be traded."),
    );
  }

  if (expectedCategory && metadata.category !== expectedCategory) {
    return ErrResult(
      new MarketError("INVALID_CATEGORY", "The item does not belong to that category."),
    );
  }

  return OkResult({
    itemKind: isInstanceBased(itemId) ? "instance" : "stackable",
    category: metadata.category,
    metadata,
  });
}

function ensurePriceInRange(
  pricePerUnit: number,
  metadata: NonNullable<ReturnType<typeof getMarketMetadata>>,
): Result<number, MarketError> {
  if (!isFiniteInt(pricePerUnit) || pricePerUnit < 1) {
    return ErrResult(
      new MarketError("INVALID_PRICE", "Price must be an integer greater than or equal to 1."),
    );
  }

  const min = metadata.minPrice ?? 1;
  const max = metadata.maxPrice ?? Number.MAX_SAFE_INTEGER;
  if (pricePerUnit < min || pricePerUnit > max) {
    return ErrResult(
      new MarketError(
        "PRICE_OUT_OF_RANGE",
        `Price must be between ${min} and ${max}.`,
      ),
    );
  }

  return OkResult(Math.trunc(pricePerUnit));
}

function addStackableQuantity(
  inventory: ModernInventory,
  itemId: ItemId,
  quantity: number,
): Result<ModernInventory, MarketError> {
  const entry = inventory[itemId];
  if (entry?.type === "instances") {
    return ErrResult(
      new MarketError("TRANSACTION_FAILED", "Invalid inventory type for stackable item."),
    );
  }

  const current = entry?.type === "stackable" ? entry.quantity : 0;
  return OkResult({
    ...inventory,
    [itemId]: { type: "stackable", quantity: current + quantity },
  });
}

function removeStackableQuantity(
  inventory: ModernInventory,
  itemId: ItemId,
  quantity: number,
): Result<ModernInventory, MarketError> {
  const entry = inventory[itemId];
  if (entry?.type !== "stackable") {
    return ErrResult(
      new MarketError("INSUFFICIENT_INVENTORY", "You do not have enough items."),
    );
  }
  if (entry.quantity < quantity) {
    return ErrResult(
      new MarketError("INSUFFICIENT_INVENTORY", `You only have ${entry.quantity}.`),
    );
  }
  const next: ModernInventory = { ...inventory };
  const remaining = entry.quantity - quantity;
  if (remaining <= 0) {
    delete next[itemId];
  } else {
    next[itemId] = { type: "stackable", quantity: remaining };
  }
  return OkResult(next);
}

function removeInstanceForEscrow(
  inventory: ModernInventory,
  itemId: ItemId,
  preferredInstanceId?: string,
): Result<{ inventory: ModernInventory; instance: ItemInstance }, MarketError> {
  if (preferredInstanceId) {
    const byId = removeInstanceById(inventory, itemId, preferredInstanceId);
    if (!byId.removed) {
      return ErrResult(
        new MarketError("INSUFFICIENT_INVENTORY", "You do not own that instance."),
      );
    }
    return OkResult({ inventory: byId.inventory, instance: byId.removed });
  }

  const popped = popInstances(inventory, itemId, 1);
  const instance = popped.removed[0];
  if (!instance) {
    return ErrResult(
      new MarketError("INSUFFICIENT_INVENTORY", "You do not have any instances of that item."),
    );
  }
  return OkResult({ inventory: popped.inventory, instance });
}

function getCurrencyCostValue(currencyId: string, amount: number): unknown {
  if (currencyId === "coins") {
    return {
      hand: amount,
      bank: 0,
      use_total_on_subtract: true,
    };
  }
  return amount;
}

function getCurrencyRewardValue(currencyId: string, amount: number): unknown {
  if (currencyId === "coins") {
    return {
      hand: amount,
      bank: 0,
      use_total_on_subtract: false,
    };
  }
  return amount;
}

function debitCurrency(
  snapshot: CurrencyInventory,
  currencyId: string,
  amount: number,
): Result<CurrencyInventory, MarketError> {
  const applied = currencyEngine.apply(snapshot, {
    costs: [{ currencyId, value: getCurrencyCostValue(currencyId, amount) }],
    allowDebt: false,
  });
  if (applied.isErr()) {
    return ErrResult(
      new MarketError("INSUFFICIENT_FUNDS", "You do not have enough funds."),
    );
  }
  return OkResult(applied.unwrap());
}

function creditCurrency(
  snapshot: CurrencyInventory,
  currencyId: string,
  amount: number,
): Result<CurrencyInventory, MarketError> {
  const applied = currencyEngine.apply(snapshot, {
    rewards: [{ currencyId, value: getCurrencyRewardValue(currencyId, amount) }],
    allowDebt: false,
  });
  if (applied.isErr()) {
    return ErrResult(new MarketError("TRANSACTION_FAILED", "Could not credit currency."));
  }
  return OkResult(applied.unwrap());
}

export function computeMarketPricing(
  subtotal: number,
  options: {
    readonly taxEnabled: boolean;
    readonly taxRate: number;
    readonly minimumTaxableAmount: number;
    readonly feeRate: number;
  },
): MarketPricing {
  const taxable = options.taxEnabled && subtotal >= options.minimumTaxableAmount;
  const tax = taxable ? Math.floor(subtotal * options.taxRate) : 0;
  const fee = options.feeRate > 0 ? Math.floor(subtotal * options.feeRate) : 0;
  return {
    subtotal,
    tax,
    fee,
    total: subtotal + tax + fee,
    sellerPayout: subtotal,
  };
}

export function sortListingsForDisplay(
  listings: readonly MarketListingDoc[],
): MarketListingDoc[] {
  return [...listings].sort((a, b) => {
    if (a.pricePerUnit !== b.pricePerUnit) {
      return a.pricePerUnit - b.pricePerUnit;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

async function ensureAccountCanTrade(userId: UserId): Promise<Result<void, MarketError>> {
  const accountResult = await economyAccountRepo.ensure(userId);
  if (accountResult.isErr()) {
    return ErrResult(
      new MarketError("TRANSACTION_FAILED", "Could not verify the economy account."),
    );
  }

  const account = accountResult.unwrap().account;
  if (account.status === "blocked") {
    return ErrResult(
      new MarketError("ACCOUNT_BLOCKED", "Your account has temporary restrictions."),
    );
  }
  if (account.status === "banned") {
    return ErrResult(
      new MarketError("ACCOUNT_BANNED", "Your account has permanent restrictions."),
    );
  }

  return OkResult(undefined);
}

async function ensureMarketEnabled(guildId: GuildId): Promise<Result<void, MarketError>> {
  const guildResult = await guildEconomyRepo.ensure(guildId);
  if (guildResult.isErr()) {
    return ErrResult(
      new MarketError("TRANSACTION_FAILED", "Could not load guild economy settings."),
    );
  }
  if (!guildResult.unwrap().features.store) {
    return ErrResult(
      new MarketError("FEATURE_DISABLED", "Marketplace is disabled in this server."),
    );
  }
  return OkResult(undefined);
}

function buildListingFromEscrow(input: {
  guildId: GuildId;
  sellerId: UserId;
  itemId: ItemId;
  category: MarketCategory;
  pricePerUnit: number;
  expiresAt?: Date | null;
  escrow: ListingEscrow;
}): MarketListingDoc {
  const now = new Date();
  const listingId = makeListingId();

  if (input.escrow.kind === "instance") {
    const instances = input.escrow.instances;
    return {
      _id: listingId,
      guildId: input.guildId,
      sellerId: input.sellerId,
      itemId: input.itemId,
      category: input.category,
      itemKind: "instance",
      currencyId: "coins",
      pricePerUnit: input.pricePerUnit,
      quantity: instances.length,
      instanceIds: instances.map((entry) => entry.instanceId),
      escrowInstances: instances,
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt ?? null,
      status: "active",
      version: 0,
    };
  }

  return {
    _id: listingId,
    guildId: input.guildId,
    sellerId: input.sellerId,
    itemId: input.itemId,
    category: input.category,
    itemKind: "stackable",
    currencyId: "coins",
    pricePerUnit: input.pricePerUnit,
    quantity: input.escrow.quantity,
    instanceIds: [],
    escrowInstances: [],
    createdAt: now,
    updatedAt: now,
    expiresAt: input.expiresAt ?? null,
    status: "active",
    version: 0,
  };
}

function mapListingView(listing: MarketListingDoc): MarketListingView {
  const firstInstance = listing.escrowInstances?.[0];
  return {
    listingId: listing._id,
    sellerId: listing.sellerId,
    itemId: listing.itemId,
    itemKind: listing.itemKind,
    pricePerUnit: listing.pricePerUnit,
    quantity: listing.quantity,
    createdAt: listing.createdAt,
    instance: firstInstance
      ? {
          instanceId: firstInstance.instanceId,
          itemId: firstInstance.itemId,
          durability: firstInstance.durability,
        }
      : undefined,
  };
}

async function runWithOptionalTransaction<T>(
  operation: (session: ClientSession) => Promise<T>,
): Promise<Result<{ mode: "transaction"; value: T } | { mode: "fallback" }, Error>> {
  const client = await getMongoClient();
  const session = client.startSession();
  try {
    let value: T | undefined;
    await session.withTransaction(async () => {
      value = await operation(session);
    });
    if (value === undefined) {
      return ErrResult(new Error("TRANSACTION_RESULT_UNDEFINED"));
    }
    return OkResult({ mode: "transaction", value });
  } catch (error) {
    if (isTransactionUnsupported(error)) {
      return OkResult({ mode: "fallback" });
    }
    return ErrResult(error instanceof Error ? error : new Error(String(error)));
  } finally {
    await session.endSession();
  }
}

async function emitQuestEventFromMarketList(
  input: ListMarketItemInput,
  result: ListMarketItemResult,
): Promise<void> {
  try {
    const { rpgQuestService } = await import("@/modules/rpg/quests");
    await rpgQuestService.onEvent({
      type: "market_list",
      guildId: input.guildId,
      userId: input.sellerId,
      itemId: result.itemId,
      qty: result.quantity,
      correlationId: result.correlationId,
      timestamp: result.createdAt,
    });
  } catch (error) {
    console.error("[MarketService] Failed to emit quest market_list event:", error);
  }
}

async function emitQuestEventFromMarketBuy(
  input: BuyListingInput,
  result: BuyListingResult,
): Promise<void> {
  try {
    const { rpgQuestService } = await import("@/modules/rpg/quests");
    await rpgQuestService.onEvent({
      type: "market_buy",
      guildId: input.guildId,
      userId: input.buyerId,
      itemId: result.itemId,
      qty: result.quantity,
      correlationId: result.correlationId,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("[MarketService] Failed to emit quest market_buy event:", error);
  }
}

class MarketServiceImpl implements MarketService {
  async listItem(input: ListMarketItemInput): Promise<Result<ListMarketItemResult, MarketError>> {
    const gate = await ensureMarketEnabled(input.guildId);
    if (gate.isErr()) return ErrResult(gate.error);

    const cooldown = checkCooldown(
      listingCooldown,
      input.sellerId,
      MARKET_DEFAULTS.createCooldownMs,
    );
    if (cooldown.isErr()) return ErrResult(cooldown.error);

    const access = await ensureAccountCanTrade(input.sellerId);
    if (access.isErr()) return ErrResult(access.error);

    const quantityResult = ensurePositiveInt(
      input.quantity,
      "Quantity must be greater than 0.",
    );
    if (quantityResult.isErr()) return ErrResult(quantityResult.error);

    const tradable = ensureTradableItem(input.itemId);
    if (tradable.isErr()) return ErrResult(tradable.error);

    const priceResult = ensurePriceInRange(input.pricePerUnit, tradable.unwrap().metadata);
    if (priceResult.isErr()) return ErrResult(priceResult.error);
    const pricePerUnit = priceResult.unwrap();

    if (tradable.unwrap().itemKind === "instance" && quantityResult.unwrap() !== 1) {
      return ErrResult(
        new MarketError("INVALID_QUANTITY", "Instance items can only be listed with quantity 1."),
      );
    }

    const correlationId = input.correlationId ?? buildCorrelation("market_list");

    const txResult = await runWithOptionalTransaction(async (session) => {
      return this.listItemTransaction(
        input,
        tradable.unwrap().category,
        tradable.unwrap().itemKind,
        quantityResult.unwrap(),
        pricePerUnit,
        correlationId,
        session,
      );
    });
    if (txResult.isErr()) {
      return ErrResult(mapTransactionError(txResult.error));
    }

    const txOutcome = txResult.unwrap();
    if (txOutcome.mode === "transaction") {
      markCooldown(listingCooldown, input.sellerId);
      await emitQuestEventFromMarketList(input, txOutcome.value);
      return OkResult(txOutcome.value);
    }

    const fallback = await this.listItemFallback(
      input,
      tradable.unwrap().category,
      tradable.unwrap().itemKind,
      quantityResult.unwrap(),
      pricePerUnit,
      correlationId,
    );
    if (fallback.isOk()) {
      markCooldown(listingCooldown, input.sellerId);
    }
    return fallback;
  }

  async browseIndex(
    guildId: GuildId,
    category?: MarketCategory,
  ): Promise<Result<MarketBrowseIndexEntry[], MarketError>> {
    const gate = await ensureMarketEnabled(guildId);
    if (gate.isErr()) return ErrResult(gate.error);

    const index = await marketRepository.aggregateItemIndex(guildId, undefined, category);
    if (index.isErr()) {
      return ErrResult(new MarketError("TRANSACTION_FAILED", index.error.message));
    }

    const rows: MarketBrowseIndexEntry[] = [];
    for (const entry of index.unwrap()) {
      const tradable = ensureTradableItem(entry.itemId, category);
      if (tradable.isErr()) continue;
      rows.push({
        itemId: entry.itemId,
        category: tradable.unwrap().category,
        listingCount: entry.listingCount,
        cheapestPrice: entry.cheapestPrice,
      });
    }

    rows.sort((a, b) => {
      if (a.cheapestPrice !== b.cheapestPrice) {
        return a.cheapestPrice - b.cheapestPrice;
      }
      return a.itemId.localeCompare(b.itemId);
    });

    return OkResult(rows);
  }

  async getListingsForItem(
    guildId: GuildId,
    itemId: ItemId,
    page: number = 0,
    pageSize: number = MARKET_DEFAULTS.pageSize,
  ): Promise<Result<MarketListingView[], MarketError>> {
    const gate = await ensureMarketEnabled(guildId);
    if (gate.isErr()) return ErrResult(gate.error);

    const tradable = ensureTradableItem(itemId);
    if (tradable.isErr()) return ErrResult(tradable.error);

    const rows = await marketRepository.listActiveByItem(
      guildId,
      itemId,
      clampPage(page),
      Math.max(1, Math.min(25, pageSize)),
    );
    if (rows.isErr()) {
      return ErrResult(new MarketError("TRANSACTION_FAILED", rows.error.message));
    }

    return OkResult(sortListingsForDisplay(rows.unwrap()).map(mapListingView));
  }

  async buyListing(input: BuyListingInput): Promise<Result<BuyListingResult, MarketError>> {
    const gate = await ensureMarketEnabled(input.guildId);
    if (gate.isErr()) return ErrResult(gate.error);

    const cooldown = checkCooldown(buyCooldown, input.buyerId, MARKET_DEFAULTS.buyCooldownMs);
    if (cooldown.isErr()) return ErrResult(cooldown.error);

    const access = await ensureAccountCanTrade(input.buyerId);
    if (access.isErr()) return ErrResult(access.error);

    const quantityResult = ensurePositiveInt(input.quantity, "Invalid quantity.");
    if (quantityResult.isErr()) return ErrResult(quantityResult.error);

    const correlationId = input.correlationId ?? buildCorrelation("market_buy");

    const txResult = await runWithOptionalTransaction(async (session) => {
      return this.buyListingTransaction(
        input,
        quantityResult.unwrap(),
        correlationId,
        session,
      );
    });
    if (txResult.isErr()) {
      return ErrResult(mapTransactionError(txResult.error));
    }
    const txOutcome = txResult.unwrap();
    if (txOutcome.mode === "transaction") {
      markCooldown(buyCooldown, input.buyerId);
      await emitQuestEventFromMarketBuy(input, txOutcome.value);
      return OkResult(txOutcome.value);
    }

    const fallback = await this.buyListingFallback(
      input,
      quantityResult.unwrap(),
      correlationId,
    );
    if (fallback.isOk()) {
      markCooldown(buyCooldown, input.buyerId);
    }
    return fallback;
  }

  async cancelListing(
    input: CancelListingInput,
  ): Promise<Result<CancelListingResult, MarketError>> {
    const gate = await ensureMarketEnabled(input.guildId);
    if (gate.isErr()) return ErrResult(gate.error);

    const correlationId = input.correlationId ?? buildCorrelation("market_cancel");

    const txResult = await runWithOptionalTransaction(async (session) => {
      return this.cancelListingTransaction(input, correlationId, session);
    });
    if (txResult.isErr()) {
      return ErrResult(mapTransactionError(txResult.error));
    }
    const txOutcome = txResult.unwrap();
    if (txOutcome.mode === "transaction") {
      return OkResult(txOutcome.value);
    }

    return this.cancelListingFallback(input, correlationId);
  }

  async getMyListings(
    guildId: GuildId,
    sellerId: UserId,
    page: number = 0,
    pageSize: number = MARKET_DEFAULTS.pageSize,
  ): Promise<Result<MarketListingView[], MarketError>> {
    const rows = await marketRepository.listActiveBySeller(
      guildId,
      sellerId,
      clampPage(page),
      Math.max(1, Math.min(25, pageSize)),
    );
    if (rows.isErr()) {
      return ErrResult(new MarketError("TRANSACTION_FAILED", rows.error.message));
    }
    return OkResult(rows.unwrap().map(mapListingView));
  }

  async getSellableItems(
    guildId: GuildId,
    userId: UserId,
    category?: MarketCategory,
  ): Promise<Result<SellableItemView[], MarketError>> {
    const gate = await ensureMarketEnabled(guildId);
    if (gate.isErr()) return ErrResult(gate.error);

    const access = await ensureAccountCanTrade(userId);
    if (access.isErr()) return ErrResult(access.error);

    const userResult = await UserStore.ensure(userId);
    if (userResult.isErr()) {
      return ErrResult(new MarketError("TRANSACTION_FAILED", userResult.error.message));
    }

    const inventory = normalizeModernInventory(userResult.unwrap().inventory);
    const rows: SellableItemView[] = [];

    for (const [itemId, entry] of Object.entries(inventory)) {
      if (!entry) continue;
      const tradable = ensureTradableItem(itemId, category);
      if (tradable.isErr()) continue;

      if (entry.type === "instances") {
        if (entry.instances.length <= 0) continue;
        rows.push({
          itemId,
          category: tradable.unwrap().category,
          itemKind: "instance",
          quantity: entry.instances.length,
          instances: entry.instances,
          suggestedPrice: tradable.unwrap().metadata.suggestedPrice,
          minPrice: tradable.unwrap().metadata.minPrice,
          maxPrice: tradable.unwrap().metadata.maxPrice,
        });
      } else {
        if (entry.quantity <= 0) continue;
        rows.push({
          itemId,
          category: tradable.unwrap().category,
          itemKind: "stackable",
          quantity: entry.quantity,
          suggestedPrice: tradable.unwrap().metadata.suggestedPrice,
          minPrice: tradable.unwrap().metadata.minPrice,
          maxPrice: tradable.unwrap().metadata.maxPrice,
        });
      }
    }

    rows.sort((a, b) => {
      if (a.category !== b.category) {
        return categoryLabel(a.category).localeCompare(categoryLabel(b.category));
      }
      return a.itemId.localeCompare(b.itemId);
    });

    return OkResult(rows);
  }

  private async listItemTransaction(
    input: ListMarketItemInput,
    category: MarketCategory,
    itemKind: MarketItemKind,
    quantity: number,
    pricePerUnit: number,
    correlationId: string,
    session: ClientSession,
  ): Promise<ListMarketItemResult> {
    const activeCount = await marketRepository.countActiveBySeller(
      input.guildId,
      input.sellerId,
      { session },
    );
    if (activeCount.isErr()) {
      throw activeCount.error;
    }
    if (activeCount.unwrap() >= MARKET_DEFAULTS.maxActiveListingsPerUser) {
      throw new MarketError(
        "LISTING_LIMIT_REACHED",
        `Maximum ${MARKET_DEFAULTS.maxActiveListingsPerUser} active listings.`,
      );
    }

    const usersCol = await UserStore.collection();
    const userDoc = await usersCol.findOne({ _id: input.sellerId } as any, { session });
    if (!userDoc) {
      throw new MarketError("TRANSACTION_FAILED", "Seller not found.");
    }

    const inventory = normalizeModernInventory((userDoc as any).inventory);

    let nextInventory: ModernInventory;
    let escrow: ListingEscrow;

    if (itemKind === "instance") {
      const removed = removeInstanceForEscrow(inventory, input.itemId, input.instanceId);
      if (removed.isErr()) {
        throw removed.error;
      }
      nextInventory = removed.unwrap().inventory;
      escrow = { kind: "instance", instances: [removed.unwrap().instance] };
    } else {
      const removed = removeStackableQuantity(inventory, input.itemId, quantity);
      if (removed.isErr()) {
        throw removed.error;
      }
      nextInventory = removed.unwrap();
      escrow = { kind: "stackable", quantity };
    }

    const listing = buildListingFromEscrow({
      guildId: input.guildId,
      sellerId: input.sellerId,
      itemId: input.itemId,
      category,
      pricePerUnit,
      expiresAt: input.expiresAt,
      escrow,
    });

    await usersCol.updateOne(
      { _id: input.sellerId } as any,
      { $set: { inventory: nextInventory, updatedAt: new Date() } } as any,
      { session },
    );

    const createResult = await marketRepository.create(listing, { session });
    if (createResult.isErr()) {
      throw createResult.error;
    }

    const audit = await economyAuditRepo.create(
      {
        operationType: "market_list",
        actorId: input.sellerId,
        targetId: input.sellerId,
        guildId: input.guildId,
        source: "market",
        reason: `Market listing for ${input.itemId}`,
        itemData: {
          itemId: input.itemId,
          quantity: listing.quantity,
        },
        metadata: {
          correlationId,
          listingId: listing._id,
          itemId: input.itemId,
          qty: listing.quantity,
          pricePerUnit: listing.pricePerUnit,
          category,
        },
      },
      { session },
    );
    if (audit.isErr()) {
      throw audit.error;
    }

    return {
      listingId: listing._id,
      guildId: input.guildId,
      sellerId: input.sellerId,
      itemId: input.itemId,
      itemKind,
      quantity: listing.quantity,
      pricePerUnit: listing.pricePerUnit,
      correlationId,
      createdAt: listing.createdAt,
    };
  }

  private async listItemFallback(
    input: ListMarketItemInput,
    category: MarketCategory,
    itemKind: MarketItemKind,
    quantity: number,
    pricePerUnit: number,
    correlationId: string,
  ): Promise<Result<ListMarketItemResult, MarketError>> {
    const activeCount = await marketRepository.countActiveBySeller(input.guildId, input.sellerId);
    if (activeCount.isErr()) {
      return ErrResult(new MarketError("TRANSACTION_FAILED", activeCount.error.message));
    }
    if (activeCount.unwrap() >= MARKET_DEFAULTS.maxActiveListingsPerUser) {
      return ErrResult(
        new MarketError(
          "LISTING_LIMIT_REACHED",
          `Maximum ${MARKET_DEFAULTS.maxActiveListingsPerUser} active listings.`,
        ),
      );
    }

    const escrowResult = await runUserTransition<
      ModernInventory,
      { inventory: ModernInventory; escrow: ListingEscrow },
      ListingEscrow
    >(input.sellerId, {
      getSnapshot: (user) => normalizeModernInventory(user.inventory),
      computeNext: (snapshot) => {
        if (itemKind === "instance") {
          const removed = removeInstanceForEscrow(snapshot, input.itemId, input.instanceId);
          if (removed.isErr()) return ErrResult(removed.error);
          return OkResult({
            inventory: removed.unwrap().inventory,
            escrow: { kind: "instance", instances: [removed.unwrap().instance] } as ListingEscrow,
          });
        }
        const removed = removeStackableQuantity(snapshot, input.itemId, quantity);
        if (removed.isErr()) return ErrResult(removed.error);
        return OkResult({
          inventory: removed.unwrap(),
          escrow: { kind: "stackable", quantity } as ListingEscrow,
        });
      },
      commit: (userId, expected, next) =>
        UserStore.replaceIfMatch(
          userId,
          { inventory: expected } as any,
          { inventory: next.inventory } as any,
        ),
      project: (_updatedUser, next) => next.escrow,
      conflictError: "MARKET_LIST_CONFLICT",
    });

    if (escrowResult.isErr()) {
      return ErrResult(
        escrowResult.error instanceof MarketError
          ? escrowResult.error
          : new MarketError("TRANSACTION_FAILED", escrowResult.error.message),
      );
    }

    const listing = buildListingFromEscrow({
      guildId: input.guildId,
      sellerId: input.sellerId,
      itemId: input.itemId,
      category,
      pricePerUnit,
      expiresAt: input.expiresAt,
      escrow: escrowResult.unwrap(),
    });

    const created = await marketRepository.create(listing);
    if (created.isErr()) {
      await this.restoreEscrowToSeller(input.sellerId, input.itemId, escrowResult.unwrap());
      return ErrResult(new MarketError("TRANSACTION_FAILED", created.error.message));
    }

    await economyAuditRepo.create({
      operationType: "market_list",
      actorId: input.sellerId,
      targetId: input.sellerId,
      guildId: input.guildId,
      source: "market",
      reason: `Market listing for ${input.itemId}`,
      itemData: {
        itemId: input.itemId,
        quantity: listing.quantity,
      },
      metadata: {
        correlationId,
        listingId: listing._id,
        itemId: input.itemId,
        qty: listing.quantity,
        pricePerUnit: listing.pricePerUnit,
        category,
        mode: "fallback",
      },
    });

    return OkResult({
      listingId: listing._id,
      guildId: input.guildId,
      sellerId: input.sellerId,
      itemId: input.itemId,
      itemKind,
      quantity: listing.quantity,
      pricePerUnit: listing.pricePerUnit,
      correlationId,
      createdAt: listing.createdAt,
    });
  }

  private async buyListingTransaction(
    input: BuyListingInput,
    quantity: number,
    correlationId: string,
    session: ClientSession,
  ): Promise<BuyListingResult> {
    const listingResult = await marketRepository.findById(input.listingId, { session });
    if (listingResult.isErr()) throw listingResult.error;
    const listing = listingResult.unwrap();
    if (!listing || listing.guildId !== input.guildId) {
      throw new MarketError("LISTING_NOT_FOUND", "Listing not found.");
    }
    if (listing.status !== "active" || listing.quantity <= 0) {
      throw new MarketError("LISTING_NOT_ACTIVE", "The listing is no longer active.");
    }
    if (listing.sellerId === input.buyerId) {
      throw new MarketError("SELF_BUY_FORBIDDEN", "You cannot buy your own listing.");
    }
    if (listing.itemKind === "instance" && quantity !== 1) {
      throw new MarketError(
        "INVALID_QUANTITY",
        "Instance listings only allow quantity 1.",
      );
    }
    if (quantity > listing.quantity) {
      throw new MarketError(
        "INSUFFICIENT_LISTING_QUANTITY",
        `Only ${listing.quantity} units remain.`,
      );
    }

    const sellerAccess = await ensureAccountCanTrade(listing.sellerId);
    if (sellerAccess.isErr()) throw sellerAccess.error;

    const usersCol = await UserStore.collection();
    const guildsCol = await GuildStore.collection();

    const [buyerDoc, sellerDoc, guildConfigResult] = await Promise.all([
      usersCol.findOne({ _id: input.buyerId } as any, { session }),
      usersCol.findOne({ _id: listing.sellerId } as any, { session }),
      guildEconomyRepo.ensure(input.guildId),
    ]);

    if (!buyerDoc || !sellerDoc) {
      throw new MarketError("TRANSACTION_FAILED", "Could not load accounts.");
    }
    if (guildConfigResult.isErr()) {
      throw new MarketError("TRANSACTION_FAILED", guildConfigResult.error.message);
    }

    const guildConfig = guildConfigResult.unwrap();
    const subtotal = listing.pricePerUnit * quantity;
    const pricing = computeMarketPricing(subtotal, {
      taxEnabled: guildConfig.tax.enabled,
      taxRate: guildConfig.tax.rate,
      minimumTaxableAmount: guildConfig.tax.minimumTaxableAmount,
      feeRate: MARKET_DEFAULTS.feeRate,
    });

    const buyerInventory = normalizeModernInventory((buyerDoc as any).inventory);
    const buyerCurrency = ((buyerDoc as any).currency ?? {}) as CurrencyInventory;
    const sellerCurrency = ((sellerDoc as any).currency ?? {}) as CurrencyInventory;

    const capacityAfter = simulateModernCapacityAfterAdd(
      buyerInventory,
      listing.itemId,
      quantity,
      {
        ignoreUnknownItem: false,
      },
    );
    if (capacityAfter.weightExceeded || capacityAfter.slotsExceeded) {
      throw new MarketError(
        "CAPACITY_EXCEEDED",
        "Your inventory does not have enough capacity for this purchase.",
      );
    }

    const debitedBuyer = debitCurrency(buyerCurrency, listing.currencyId, pricing.total);
    if (debitedBuyer.isErr()) throw debitedBuyer.error;

    const creditedSeller = creditCurrency(
      sellerCurrency,
      listing.currencyId,
      pricing.sellerPayout,
    );
    if (creditedSeller.isErr()) throw creditedSeller.error;

    let nextBuyerInventory = buyerInventory;
    if (listing.itemKind === "instance") {
      const instance = listing.escrowInstances?.[0];
      if (!instance) {
        throw new MarketError("TRANSACTION_FAILED", "Escrow instance does not exist.");
      }
      nextBuyerInventory = addInstances(nextBuyerInventory, [instance]);
    } else {
      const added = addStackableQuantity(nextBuyerInventory, listing.itemId, quantity);
      if (added.isErr()) throw added.error;
      nextBuyerInventory = added.unwrap();
    }

    const listingPatch: Partial<MarketListingDoc> = {
      quantity: listing.quantity - quantity,
      status: listing.quantity - quantity <= 0 ? "sold_out" : "active",
    };

    if (listing.itemKind === "instance") {
      const kept = (listing.escrowInstances ?? []).slice(quantity);
      listingPatch.escrowInstances = kept;
      listingPatch.instanceIds = kept.map((entry) => entry.instanceId);
    }

    const listingUpdate = await marketRepository.updateById(input.listingId, listingPatch, {
      session,
    });
    if (listingUpdate.isErr() || !listingUpdate.unwrap()) {
      throw new MarketError("TRANSACTION_FAILED", "Could not update listing.");
    }

    await Promise.all([
      usersCol.updateOne(
        { _id: input.buyerId } as any,
        {
          $set: {
            inventory: nextBuyerInventory,
            currency: debitedBuyer.unwrap(),
            updatedAt: new Date(),
          },
        } as any,
        { session },
      ),
      usersCol.updateOne(
        { _id: listing.sellerId } as any,
        {
          $set: {
            currency: creditedSeller.unwrap(),
            updatedAt: new Date(),
          },
        } as any,
        { session },
      ),
    ]);

    const sectorInc: Record<string, number> = {};
    if (pricing.tax > 0) {
      sectorInc[`economy.sectors.${guildConfig.tax.taxSector}`] = pricing.tax;
    }
    if (pricing.fee > 0) {
      sectorInc[`economy.sectors.${MARKET_DEFAULTS.feeSector}`] =
        (sectorInc[`economy.sectors.${MARKET_DEFAULTS.feeSector}`] ?? 0) + pricing.fee;
    }

    if (Object.keys(sectorInc).length > 0) {
      await guildsCol.updateOne(
        { _id: input.guildId } as any,
        {
          $inc: sectorInc as any,
          $set: { updatedAt: new Date() } as any,
        } as any,
        { session },
      );
    }

    const audit = await economyAuditRepo.create(
      {
        operationType: "market_buy",
        actorId: input.buyerId,
        targetId: listing.sellerId,
        guildId: input.guildId,
        source: "market",
        reason: `Market buy ${listing.itemId}`,
        currencyData: {
          currencyId: listing.currencyId,
          delta: -pricing.total,
          beforeBalance: (buyerDoc as any).currency?.[listing.currencyId] ?? 0,
          afterBalance: debitedBuyer.unwrap()[listing.currencyId] ?? 0,
        },
        itemData: {
          itemId: listing.itemId,
          quantity,
        },
        metadata: {
          correlationId,
          listingId: listing._id,
          itemId: listing.itemId,
          qty: quantity,
          pricePerUnit: listing.pricePerUnit,
          subtotal: pricing.subtotal,
          tax: pricing.tax,
          fee: pricing.fee,
          total: pricing.total,
          buyerId: input.buyerId,
          sellerId: listing.sellerId,
        },
      },
      { session },
    );
    if (audit.isErr()) throw audit.error;

    return {
      listingId: listing._id,
      guildId: input.guildId,
      itemId: listing.itemId,
      quantity,
      subtotal: pricing.subtotal,
      tax: pricing.tax,
      fee: pricing.fee,
      total: pricing.total,
      sellerPayout: pricing.sellerPayout,
      buyerId: input.buyerId,
      sellerId: listing.sellerId,
      correlationId,
      listingRemaining: Math.max(0, listing.quantity - quantity),
    };
  }

  private async buyListingFallback(
    input: BuyListingInput,
    quantity: number,
    correlationId: string,
  ): Promise<Result<BuyListingResult, MarketError>> {
    const listingResult = await marketRepository.findById(input.listingId);
    if (listingResult.isErr()) {
      return ErrResult(new MarketError("TRANSACTION_FAILED", listingResult.error.message));
    }
    const listing = listingResult.unwrap();
    if (!listing || listing.guildId !== input.guildId) {
      return ErrResult(new MarketError("LISTING_NOT_FOUND", "Listing not found."));
    }
    if (listing.status !== "active" || listing.quantity <= 0) {
      return ErrResult(new MarketError("LISTING_NOT_ACTIVE", "The listing is not active."));
    }
    if (listing.sellerId === input.buyerId) {
      return ErrResult(
        new MarketError("SELF_BUY_FORBIDDEN", "You cannot buy your own listing."),
      );
    }
    if (listing.itemKind === "instance" && quantity !== 1) {
      return ErrResult(
        new MarketError(
          "INVALID_QUANTITY",
          "Instance listings only allow quantity 1.",
        ),
      );
    }
    if (quantity > listing.quantity) {
      return ErrResult(
        new MarketError("INSUFFICIENT_LISTING_QUANTITY", `Only ${listing.quantity} remain.`),
      );
    }

    const guildConfig = await guildEconomyRepo.ensure(input.guildId);
    if (guildConfig.isErr()) {
      return ErrResult(new MarketError("TRANSACTION_FAILED", guildConfig.error.message));
    }

    const pricing = computeMarketPricing(listing.pricePerUnit * quantity, {
      taxEnabled: guildConfig.unwrap().tax.enabled,
      taxRate: guildConfig.unwrap().tax.rate,
      minimumTaxableAmount: guildConfig.unwrap().tax.minimumTaxableAmount,
      feeRate: MARKET_DEFAULTS.feeRate,
    });

    const reserved = await marketRepository.decrementEscrow(listing._id, quantity, {
      expectedVersion: listing.version,
    });
    if (reserved.isErr() || !reserved.unwrap()) {
      return ErrResult(
        new MarketError(
          "INSUFFICIENT_LISTING_QUANTITY",
          "The listing changed before completing the purchase.",
        ),
      );
    }

    const buyerUpdate = await runUserTransition<
      { inventory: ModernInventory; currency: CurrencyInventory },
      { inventory: ModernInventory; currency: CurrencyInventory },
      { inventory: ModernInventory; currency: CurrencyInventory }
    >(input.buyerId, {
      getSnapshot: (user) => ({
        inventory: normalizeModernInventory(user.inventory),
        currency: (user.currency ?? {}) as CurrencyInventory,
      }),
      computeNext: (snapshot) => {
        const cap = simulateModernCapacityAfterAdd(snapshot.inventory, listing.itemId, quantity);
        if (cap.weightExceeded || cap.slotsExceeded) {
          return ErrResult(
            new MarketError("CAPACITY_EXCEEDED", "Your inventory has no available space."),
          );
        }

        const debited = debitCurrency(snapshot.currency, listing.currencyId, pricing.total);
        if (debited.isErr()) return ErrResult(debited.error);

        let nextInventory = snapshot.inventory;
        if (listing.itemKind === "instance") {
          const instance = listing.escrowInstances?.[0];
          if (!instance) {
            return ErrResult(
              new MarketError("TRANSACTION_FAILED", "Escrow instance does not exist."),
            );
          }
          nextInventory = addInstances(nextInventory, [instance]);
        } else {
          const added = addStackableQuantity(nextInventory, listing.itemId, quantity);
          if (added.isErr()) return ErrResult(added.error);
          nextInventory = added.unwrap();
        }

        return OkResult({
          inventory: nextInventory,
          currency: debited.unwrap(),
        });
      },
      commit: (userId, expected, next) =>
        UserStore.replaceIfMatch(
          userId,
          { inventory: expected.inventory, currency: expected.currency } as any,
          { inventory: next.inventory, currency: next.currency } as any,
        ),
      project: (_updated, next) => next,
      conflictError: "MARKET_BUYER_CONFLICT",
    });

    if (buyerUpdate.isErr()) {
      await this.restoreListingQuantity(listing._id, quantity);
      return ErrResult(
        buyerUpdate.error instanceof MarketError
          ? buyerUpdate.error
          : new MarketError("TRANSACTION_FAILED", buyerUpdate.error.message),
      );
    }

    const sellerUpdate = await runUserTransition(listing.sellerId, {
      getSnapshot: (user) => (user.currency ?? {}) as CurrencyInventory,
      computeNext: (snapshot) =>
        creditCurrency(snapshot, listing.currencyId, pricing.sellerPayout),
      commit: (userId, expected, next) =>
        UserStore.replaceIfMatch(
          userId,
          { currency: expected } as any,
          { currency: next } as any,
        ),
      project: (_updated, next) => next,
      conflictError: "MARKET_SELLER_CONFLICT",
    });

    if (sellerUpdate.isErr()) {
      await this.restoreListingQuantity(listing._id, quantity);
      await this.rollbackBuyerCurrencyAndItems(
        input.buyerId,
        listing,
        quantity,
        pricing.total,
      );
      return ErrResult(new MarketError("TRANSACTION_FAILED", sellerUpdate.error.message));
    }

    if (pricing.tax > 0) {
      await guildEconomyRepo.depositToSector(
        input.guildId,
        guildConfig.unwrap().tax.taxSector,
        pricing.tax,
      );
    }
    if (pricing.fee > 0) {
      await guildEconomyRepo.depositToSector(
        input.guildId,
        MARKET_DEFAULTS.feeSector,
        pricing.fee,
      );
    }

    await economyAuditRepo.create({
      operationType: "market_buy",
      actorId: input.buyerId,
      targetId: listing.sellerId,
      guildId: input.guildId,
      source: "market",
      reason: `Market buy ${listing.itemId}`,
      itemData: {
        itemId: listing.itemId,
        quantity,
      },
      metadata: {
        correlationId,
        listingId: listing._id,
        itemId: listing.itemId,
        qty: quantity,
        pricePerUnit: listing.pricePerUnit,
        subtotal: pricing.subtotal,
        tax: pricing.tax,
        fee: pricing.fee,
        total: pricing.total,
        buyerId: input.buyerId,
        sellerId: listing.sellerId,
        mode: "fallback",
      },
    });

    return OkResult({
      listingId: listing._id,
      guildId: input.guildId,
      itemId: listing.itemId,
      quantity,
      subtotal: pricing.subtotal,
      tax: pricing.tax,
      fee: pricing.fee,
      total: pricing.total,
      sellerPayout: pricing.sellerPayout,
      buyerId: input.buyerId,
      sellerId: listing.sellerId,
      correlationId,
      listingRemaining: Math.max(0, listing.quantity - quantity),
    });
  }

  private async cancelListingTransaction(
    input: CancelListingInput,
    correlationId: string,
    session: ClientSession,
  ): Promise<CancelListingResult> {
    const listingResult = await marketRepository.findById(input.listingId, { session });
    if (listingResult.isErr()) throw listingResult.error;
    const listing = listingResult.unwrap();
    if (!listing || listing.guildId !== input.guildId) {
      throw new MarketError("LISTING_NOT_FOUND", "Listing not found.");
    }
    if (listing.status !== "active") {
      throw new MarketError("LISTING_NOT_ACTIVE", "The listing is no longer active.");
    }
    if (!input.allowModeratorOverride && listing.sellerId !== input.actorId) {
      throw new MarketError("PERMISSION_DENIED", "You cannot cancel this listing.");
    }

    const usersCol = await UserStore.collection();
    const sellerDoc = await usersCol.findOne({ _id: listing.sellerId } as any, { session });
    if (!sellerDoc) {
      throw new MarketError("TRANSACTION_FAILED", "Could not load seller.");
    }

    const sellerInventory = normalizeModernInventory((sellerDoc as any).inventory);
    const capacityAfter = simulateModernCapacityAfterAdd(
      sellerInventory,
      listing.itemId,
      listing.quantity,
    );
    if (capacityAfter.weightExceeded || capacityAfter.slotsExceeded) {
      throw new MarketError(
        "CAPACITY_EXCEEDED",
        "Not enough capacity to return escrow to seller.",
      );
    }

    let nextInventory = sellerInventory;
    if (listing.itemKind === "instance") {
      const instances = listing.escrowInstances ?? [];
      nextInventory = addInstances(nextInventory, instances);
    } else {
      const added = addStackableQuantity(nextInventory, listing.itemId, listing.quantity);
      if (added.isErr()) throw added.error;
      nextInventory = added.unwrap();
    }

    await usersCol.updateOne(
      { _id: listing.sellerId } as any,
      { $set: { inventory: nextInventory, updatedAt: new Date() } } as any,
      { session },
    );

    const cancelled = await marketRepository.cancelActive(listing._id, { session });
    if (cancelled.isErr() || !cancelled.unwrap()) {
      throw new MarketError("TRANSACTION_FAILED", "Could not cancel listing.");
    }

    const audit = await economyAuditRepo.create(
      {
        operationType: "market_cancel",
        actorId: input.actorId,
        targetId: listing.sellerId,
        guildId: input.guildId,
        source: "market",
        reason: `Market cancel ${listing.itemId}`,
        itemData: {
          itemId: listing.itemId,
          quantity: listing.quantity,
        },
        metadata: {
          correlationId,
          listingId: listing._id,
          itemId: listing.itemId,
          qty: listing.quantity,
          sellerId: listing.sellerId,
        },
      },
      { session },
    );
    if (audit.isErr()) throw audit.error;

    return {
      listingId: listing._id,
      guildId: input.guildId,
      sellerId: listing.sellerId,
      itemId: listing.itemId,
      returnedQuantity: listing.quantity,
      correlationId,
    };
  }

  private async cancelListingFallback(
    input: CancelListingInput,
    correlationId: string,
  ): Promise<Result<CancelListingResult, MarketError>> {
    const listingResult = await marketRepository.findById(input.listingId);
    if (listingResult.isErr()) {
      return ErrResult(new MarketError("TRANSACTION_FAILED", listingResult.error.message));
    }
    const listing = listingResult.unwrap();
    if (!listing || listing.guildId !== input.guildId) {
      return ErrResult(new MarketError("LISTING_NOT_FOUND", "Listing not found."));
    }
    if (listing.status !== "active") {
      return ErrResult(new MarketError("LISTING_NOT_ACTIVE", "The listing is not active."));
    }
    if (!input.allowModeratorOverride && listing.sellerId !== input.actorId) {
      return ErrResult(new MarketError("PERMISSION_DENIED", "You cannot cancel this listing."));
    }

    const restore = await runUserTransition(listing.sellerId, {
      getSnapshot: (user) => normalizeModernInventory(user.inventory),
      computeNext: (snapshot) => {
        const cap = simulateModernCapacityAfterAdd(snapshot, listing.itemId, listing.quantity);
        if (cap.weightExceeded || cap.slotsExceeded) {
          return ErrResult(
            new MarketError(
              "CAPACITY_EXCEEDED",
              "Not enough capacity to return escrow to seller.",
            ),
          );
        }
        if (listing.itemKind === "instance") {
          return OkResult(addInstances(snapshot, listing.escrowInstances ?? []));
        }
        const added = addStackableQuantity(snapshot, listing.itemId, listing.quantity);
        if (added.isErr()) return ErrResult(added.error);
        return OkResult(added.unwrap());
      },
      commit: (userId, expected, next) =>
        UserStore.replaceIfMatch(
          userId,
          { inventory: expected } as any,
          { inventory: next } as any,
        ),
      project: (updated) => updated._id,
      conflictError: "MARKET_CANCEL_CONFLICT",
    });
    if (restore.isErr()) {
      return ErrResult(
        restore.error instanceof MarketError
          ? restore.error
          : new MarketError("TRANSACTION_FAILED", restore.error.message),
      );
    }

    const cancelled = await marketRepository.cancelActive(listing._id);
    if (cancelled.isErr() || !cancelled.unwrap()) {
      await this.restoreEscrowToSeller(
        listing.sellerId,
        listing.itemId,
        listing.itemKind === "instance"
          ? { kind: "instance", instances: listing.escrowInstances ?? [] }
          : { kind: "stackable", quantity: listing.quantity },
      );
      return ErrResult(new MarketError("TRANSACTION_FAILED", "Could not cancel listing."));
    }

    await economyAuditRepo.create({
      operationType: "market_cancel",
      actorId: input.actorId,
      targetId: listing.sellerId,
      guildId: input.guildId,
      source: "market",
      reason: `Market cancel ${listing.itemId}`,
      itemData: {
        itemId: listing.itemId,
        quantity: listing.quantity,
      },
      metadata: {
        correlationId,
        listingId: listing._id,
        itemId: listing.itemId,
        qty: listing.quantity,
        sellerId: listing.sellerId,
        mode: "fallback",
      },
    });

    return OkResult({
      listingId: listing._id,
      guildId: input.guildId,
      sellerId: listing.sellerId,
      itemId: listing.itemId,
      returnedQuantity: listing.quantity,
      correlationId,
    });
  }

  private async restoreEscrowToSeller(
    sellerId: UserId,
    itemId: ItemId,
    escrow: ListingEscrow,
  ): Promise<void> {
    await runUserTransition(sellerId, {
      getSnapshot: (user) => normalizeModernInventory(user.inventory),
      computeNext: (snapshot) => {
        if (escrow.kind === "instance") {
          return OkResult(addInstances(snapshot, escrow.instances));
        }
        const added = addStackableQuantity(snapshot, itemId, escrow.quantity);
        if (added.isErr()) return ErrResult(added.error);
        return OkResult(added.unwrap());
      },
      commit: (userId, expected, next) =>
        UserStore.replaceIfMatch(
          userId,
          { inventory: expected } as any,
          { inventory: next } as any,
        ),
      project: (updated) => updated._id,
      conflictError: "MARKET_RESTORE_ESCROW_CONFLICT",
    });
  }

  private async restoreListingQuantity(listingId: string, quantity: number): Promise<void> {
    const listing = await marketRepository.findById(listingId);
    if (listing.isErr() || !listing.unwrap()) return;
    await marketRepository.updateById(listingId, {
      quantity: listing.unwrap()!.quantity + quantity,
      status: "active",
    });
  }

  private async rollbackBuyerCurrencyAndItems(
    buyerId: UserId,
    listing: MarketListingDoc,
    quantity: number,
    total: number,
  ): Promise<void> {
    await runUserTransition<
      { inventory: ModernInventory; currency: CurrencyInventory },
      { inventory: ModernInventory; currency: CurrencyInventory },
      string
    >(buyerId, {
      getSnapshot: (user) => ({
        inventory: normalizeModernInventory(user.inventory),
        currency: (user.currency ?? {}) as CurrencyInventory,
      }),
      computeNext: (snapshot) => {
        const credited = creditCurrency(snapshot.currency, listing.currencyId, total);
        if (credited.isErr()) return ErrResult(credited.error);

        let nextInventory = snapshot.inventory;
        if (listing.itemKind === "instance") {
          const entry = nextInventory[listing.itemId];
          if (entry?.type === "instances" && entry.instances.length > 0) {
            const popped = popInstances(nextInventory, listing.itemId, 1);
            nextInventory = popped.inventory;
          }
        } else {
          const removed = removeStackableQuantity(nextInventory, listing.itemId, quantity);
          if (removed.isOk()) {
            nextInventory = removed.unwrap();
          }
        }

        return OkResult({
          inventory: nextInventory,
          currency: credited.unwrap(),
        });
      },
      commit: (userId, expected, next) =>
        UserStore.replaceIfMatch(
          userId,
          { inventory: expected.inventory, currency: expected.currency } as any,
          { inventory: next.inventory, currency: next.currency } as any,
        ),
      project: (updated) => updated._id,
      conflictError: "MARKET_ROLLBACK_BUYER_CONFLICT",
    });
  }
}

export const marketService: MarketService = new MarketServiceImpl();

