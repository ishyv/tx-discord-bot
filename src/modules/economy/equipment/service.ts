/**
 * Equipment Service.
 *
 * Purpose: Handle equip/unequip operations with inventory management.
 */

import { UserStore } from "@/db/repositories/users";
import type { UserId, GuildId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { runUserTransition } from "@/db/user-transition";
import type { ItemInventory } from "@/modules/inventory/inventory";
import { economyAccountRepo } from "../account/repository";
import { economyAuditRepo } from "../audit/repository";
import { progressionService } from "../progression/service";
import { getEquipableItemDefinition, getSlotDisplayName } from "./definitions";
import { equipmentRepo } from "./repository";
import type {
  EquipmentLoadout,
  EquipmentSlot,
  EquipmentStatsSummary,
  EquippedItemView,
  EquipItemInput,
  UnequipSlotInput,
  EquipmentOperationResult,
  EquipmentError,
  EquipableItemView,
} from "./types";
import {
  EquipmentError as EquipmentErrorClass,
  EQUIPMENT_SLOTS,
} from "./types";

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_OPS = 10; // 10 equip/unequip per minute

/** In-memory rate limit tracking. */
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

/** Check and update rate limit for a user. */
function checkRateLimit(userId: UserId): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    // New window
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_OPS) {
    return false;
  }

  entry.count++;
  return true;
}

/** Build equipment stats summary from loadout. */
function computeStatsSummary(loadout: EquipmentLoadout): EquipmentStatsSummary {
  const summary: EquipmentStatsSummary = {
    luck: 0,
    workBonusPct: 0,
    shopDiscountPct: 0,
    dailyBonusCap: 0,
    weightCap: 0,
    slotCap: 0,
  };

  for (const [, equipped] of Object.entries(loadout.slots)) {
    if (!equipped) continue;
    const def = getEquipableItemDefinition(equipped.itemId);
    if (!def) continue;

    const stats = def.stats;
    if (stats.luck) summary.luck += stats.luck;
    if (stats.workBonusPct) summary.workBonusPct += stats.workBonusPct;
    if (stats.shopDiscountPct) summary.shopDiscountPct += stats.shopDiscountPct;
    if (stats.dailyBonusCap) summary.dailyBonusCap += stats.dailyBonusCap;
    if (stats.weightCap) summary.weightCap += stats.weightCap;
    if (stats.slotCap) summary.slotCap += stats.slotCap;
  }

  return summary;
}

export interface EquipmentService {
  /**
   * Get user's equipment loadout.
   */
  getLoadout(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<EquipmentLoadout, Error>>;

  /**
   * Get equipped items with full details.
   */
  getEquippedItems(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<EquippedItemView[], Error>>;

  /**
   * Get equipment stats summary.
   */
  getStatsSummary(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<EquipmentStatsSummary, Error>>;

  /**
   * List equipable items in user's inventory.
   */
  listEquipableItems(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<EquipableItemView[], Error>>;

  /**
   * List equipable items for a specific slot.
   */
  listEquipableItemsForSlot(
    guildId: GuildId,
    userId: UserId,
    slot: EquipmentSlot,
  ): Promise<Result<EquipableItemView[], Error>>;

  /**
   * Equip an item from inventory.
   * If slot is occupied, swaps items (old item returns to inventory).
   */
  equipItem(
    input: EquipItemInput,
  ): Promise<Result<EquipmentOperationResult, EquipmentError>>;

  /**
   * Unequip an item from a slot (returns to inventory).
   */
  unequipSlot(
    input: UnequipSlotInput,
  ): Promise<Result<EquipmentOperationResult, EquipmentError>>;
}

class EquipmentServiceImpl implements EquipmentService {
  async getLoadout(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<EquipmentLoadout, Error>> {
    return equipmentRepo.getLoadout(guildId, userId);
  }

  async getEquippedItems(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<EquippedItemView[], Error>> {
    const loadoutResult = await this.getLoadout(guildId, userId);
    if (loadoutResult.isErr()) return ErrResult(loadoutResult.error);

    const loadout = loadoutResult.unwrap();
    const items: EquippedItemView[] = [];

    for (const slot of EQUIPMENT_SLOTS) {
      const equipped = loadout.slots[slot];
      if (!equipped) continue;

      const def = getEquipableItemDefinition(equipped.itemId);
      if (!def) continue;

      items.push({
        slot,
        itemId: equipped.itemId,
        name: def.name,
        emoji: def.emoji ?? "📦",
        description: def.description,
        stats: def.stats,
        equippedAt: equipped.equippedAt,
      });
    }

    return OkResult(items);
  }

  async getStatsSummary(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<EquipmentStatsSummary, Error>> {
    const loadoutResult = await this.getLoadout(guildId, userId);
    if (loadoutResult.isErr()) return ErrResult(loadoutResult.error);

    return OkResult(computeStatsSummary(loadoutResult.unwrap()));
  }

  async listEquipableItems(
    _guildId: GuildId,
    userId: UserId,
  ): Promise<Result<EquipableItemView[], Error>> {
    const userResult = await UserStore.get(userId);
    if (userResult.isErr()) return ErrResult(userResult.error);

    const user = userResult.unwrap();
    if (!user) return OkResult([]);

    const inventory = (user.inventory ?? {}) as ItemInventory;
    const items: EquipableItemView[] = [];

    for (const [itemId, item] of Object.entries(inventory)) {
      if (!item || item.quantity <= 0) continue;
      const def = getEquipableItemDefinition(itemId);
      if (!def) continue;

      items.push({
        itemId,
        name: def.name,
        emoji: def.emoji ?? "📦",
        description: def.description,
        slot: def.slot,
        slotDisplay: getSlotDisplayName(def.slot),
        stats: def.stats,
        quantity: item.quantity,
        requiredLevel: def.requiredLevel,
      });
    }

    return OkResult(items);
  }

  async listEquipableItemsForSlot(
    guildId: GuildId,
    userId: UserId,
    slot: EquipmentSlot,
  ): Promise<Result<EquipableItemView[], Error>> {
    const allItemsResult = await this.listEquipableItems(guildId, userId);
    if (allItemsResult.isErr()) return ErrResult(allItemsResult.error);

    // For accessory slots, show items that can go in either slot
    if (slot === "accessory1" || slot === "accessory2") {
      return OkResult(
        allItemsResult
          .unwrap()
          .filter(
            (item) => item.slot === "accessory1" || item.slot === "accessory2",
          ),
      );
    }

    return OkResult(
      allItemsResult.unwrap().filter((item) => item.slot === slot),
    );
  }

  async equipItem(
    input: EquipItemInput,
  ): Promise<Result<EquipmentOperationResult, EquipmentError>> {
    const { guildId, userId, itemId } = input;

    // Rate limit check
    if (!checkRateLimit(userId)) {
      return ErrResult(
        new EquipmentErrorClass(
          "RATE_LIMITED",
          "Demasiados cambios de equipo. Espera un momento.",
        ),
      );
    }

    // Validate item is equipable
    const itemDef = getEquipableItemDefinition(itemId);
    if (!itemDef) {
      return ErrResult(
        new EquipmentErrorClass(
          "ITEM_NOT_EQUIPABLE",
          "This item cannot be equipped.",
        ),
      );
    }

    // Check account status
    const ensureResult = await economyAccountRepo.ensure(userId);
    if (ensureResult.isErr()) {
      return ErrResult(
        new EquipmentErrorClass(
          "UPDATE_FAILED",
          "Could not access the account.",
        ),
      );
    }
    const { account } = ensureResult.unwrap();
    if (account.status === "blocked") {
      return ErrResult(
        new EquipmentErrorClass(
          "ACCOUNT_BLOCKED",
          "Your account has temporary restrictions.",
        ),
      );
    }
    if (account.status === "banned") {
      return ErrResult(
        new EquipmentErrorClass(
          "ACCOUNT_BANNED",
          "Your account has permanent restrictions.",
        ),
      );
    }

    // Check level requirement
    if (itemDef.requiredLevel) {
      const progressResult = await progressionService.getProgressView(
        guildId,
        userId,
      );
      const userLevel = progressResult.isOk()
        ? (progressResult.unwrap()?.level ?? 0)
        : 0;
      if (userLevel < itemDef.requiredLevel) {
        return ErrResult(
          new EquipmentErrorClass(
            "LEVEL_REQUIRED",
            `You need level ${itemDef.requiredLevel} to equip this item.`,
          ),
        );
      }
    }

    const correlationId = `equip_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return runUserTransition(userId, {
      attempts: 4,
      getSnapshot: (user) => ({
        inventory: (user.inventory ?? {}) as ItemInventory,
        equipment: (user.equipment ?? {}) as Record<
          string,
          {
            slots: Record<string, { itemId: string; equippedAt: string }>;
            updatedAt: string;
          }
        >,
      }),
      computeNext: (snapshot) => {
        const inventory = snapshot.inventory;
        const currentQty = inventory[itemId]?.quantity ?? 0;

        if (currentQty < 1) {
          return ErrResult(new Error("ITEM_NOT_IN_INVENTORY"));
        }

        const slot = itemDef.slot;
        const currentEquipment = snapshot.equipment[guildId] ?? {
          slots: {},
          updatedAt: new Date().toISOString(),
        };
        const currentlyEquipped = currentEquipment.slots[slot];
        const previousItemId = currentlyEquipped?.itemId;

        // Build new inventory
        const newInventory: ItemInventory = { ...inventory };
        if (currentQty === 1) {
          delete newInventory[itemId];
        } else {
          newInventory[itemId] = { id: itemId, quantity: currentQty - 1 };
        }

        // Return previous item to inventory if any
        if (previousItemId) {
          const prevQty = newInventory[previousItemId]?.quantity ?? 0;
          newInventory[previousItemId] = {
            id: previousItemId,
            quantity: prevQty + 1,
          };
        }

        // Build new equipment state
        const newSlots = { ...currentEquipment.slots };
        newSlots[slot] = { itemId, equippedAt: new Date().toISOString() };

        const newEquipment = {
          ...snapshot.equipment,
          [guildId]: {
            slots: newSlots,
            updatedAt: new Date().toISOString(),
          },
        };

        return OkResult({
          inventory: newInventory,
          equipment: newEquipment,
          slot,
          previousItemId,
          operation: previousItemId ? ("swap" as const) : ("equip" as const),
        });
      },
      commit: async (_userId, expected, next) => {
        type NextType = {
          inventory: ItemInventory;
          equipment: Record<
            string,
            {
              slots: Record<string, { itemId: string; equippedAt: string }>;
              updatedAt: string;
            }
          >;
          slot: EquipmentSlot;
          previousItemId?: string;
          operation: "equip" | "swap";
        };
        const n = next as NextType;
        return UserStore.replaceIfMatch(
          userId,
          {
            inventory: expected.inventory,
            equipment: expected.equipment,
          } as any,
          { inventory: n.inventory, equipment: n.equipment } as any,
        );
      },
      project: (_updatedUser, next) =>
        next as {
          inventory: ItemInventory;
          equipment: Record<
            string,
            {
              slots: Record<string, { itemId: string; equippedAt: string }>;
              updatedAt: string;
            }
          >;
          slot: EquipmentSlot;
          previousItemId?: string;
          operation: "equip" | "swap";
        },
      conflictError: "EQUIP_CONFLICT",
    }).then(async (result) => {
      if (result.isErr()) {
        const err = result.error;
        if (err.message === "ITEM_NOT_IN_INVENTORY") {
          return ErrResult(
            new EquipmentErrorClass(
              "ITEM_NOT_IN_INVENTORY",
              "You do not have this item in your inventory.",
            ),
          );
        }
        return ErrResult(
          new EquipmentErrorClass(
            "UPDATE_FAILED",
            "Error equipping the item. Try again.",
          ),
        );
      }

      const commit = result.unwrap();

      // Audit
      await economyAuditRepo.create({
        operationType: "item_equip",
        actorId: userId,
        targetId: userId,
        guildId,
        source: "equipment",
        reason: `Equip ${itemId} to ${commit.slot}`,
        metadata: {
          correlationId,
          itemId,
          slot: commit.slot,
          previousItemId: commit.previousItemId ?? null,
          operation: commit.operation,
        },
      });

      return OkResult({
        guildId,
        userId,
        slot: commit.slot,
        itemId,
        previousItemId: commit.previousItemId,
        operation: commit.operation,
        correlationId,
        timestamp: new Date(),
      });
    });
  }

  async unequipSlot(
    input: UnequipSlotInput,
  ): Promise<Result<EquipmentOperationResult, EquipmentError>> {
    const { guildId, userId, slot } = input;

    // Rate limit check
    if (!checkRateLimit(userId)) {
      return ErrResult(
        new EquipmentErrorClass(
          "RATE_LIMITED",
          "Demasiados cambios de equipo. Espera un momento.",
        ),
      );
    }

    // Check account status
    const ensureResult = await economyAccountRepo.ensure(userId);
    if (ensureResult.isErr()) {
      return ErrResult(
        new EquipmentErrorClass(
          "UPDATE_FAILED",
          "Could not access the account.",
        ),
      );
    }
    const { account } = ensureResult.unwrap();
    if (account.status === "blocked") {
      return ErrResult(
        new EquipmentErrorClass(
          "ACCOUNT_BLOCKED",
          "Your account has temporary restrictions.",
        ),
      );
    }
    if (account.status === "banned") {
      return ErrResult(
        new EquipmentErrorClass(
          "ACCOUNT_BANNED",
          "Your account has permanent restrictions.",
        ),
      );
    }

    const correlationId = `unequip_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return runUserTransition(userId, {
      attempts: 4,
      getSnapshot: (user) => ({
        inventory: (user.inventory ?? {}) as ItemInventory,
        equipment: (user.equipment ?? {}) as Record<
          string,
          {
            slots: Record<string, { itemId: string; equippedAt: string }>;
            updatedAt: string;
          }
        >,
      }),
      computeNext: (snapshot) => {
        const currentEquipment = snapshot.equipment[guildId];
        const currentlyEquipped = currentEquipment?.slots?.[slot];

        if (!currentlyEquipped) {
          return ErrResult(new Error("SLOT_EMPTY"));
        }

        const itemId = currentlyEquipped.itemId;

        // Build new inventory (return item)
        const newInventory: ItemInventory = { ...snapshot.inventory };
        const currentQty = newInventory[itemId]?.quantity ?? 0;
        newInventory[itemId] = { id: itemId, quantity: currentQty + 1 };

        // Build new equipment state (remove from slot)
        const newSlots = { ...currentEquipment.slots };
        delete newSlots[slot];

        const newEquipment = {
          ...snapshot.equipment,
          [guildId]: {
            slots: newSlots,
            updatedAt: new Date().toISOString(),
          },
        };

        return OkResult({
          inventory: newInventory,
          equipment: newEquipment,
          itemId,
        });
      },
      commit: async (_userId, expected, next) => {
        type NextType = {
          inventory: ItemInventory;
          equipment: Record<
            string,
            {
              slots: Record<string, { itemId: string; equippedAt: string }>;
              updatedAt: string;
            }
          >;
          itemId: string;
        };
        const n = next as NextType;
        return UserStore.replaceIfMatch(
          userId,
          {
            inventory: expected.inventory,
            equipment: expected.equipment,
          } as any,
          { inventory: n.inventory, equipment: n.equipment } as any,
        );
      },
      project: (_updatedUser, next) =>
        next as {
          inventory: ItemInventory;
          equipment: Record<
            string,
            {
              slots: Record<string, { itemId: string; equippedAt: string }>;
              updatedAt: string;
            }
          >;
          itemId: string;
        },
      conflictError: "UNEQUIP_CONFLICT",
    }).then(async (result) => {
      if (result.isErr()) {
        const err = result.error;
        if (err.message === "SLOT_EMPTY") {
          return ErrResult(
            new EquipmentErrorClass(
              "SLOT_EMPTY",
              "There is no item equipped in this slot.",
            ),
          );
        }
        return ErrResult(
          new EquipmentErrorClass(
            "UPDATE_FAILED",
            "Error unequipping the item. Try again.",
          ),
        );
      }

      const commit = result.unwrap();

      // Audit
      await economyAuditRepo.create({
        operationType: "item_unequip",
        actorId: userId,
        targetId: userId,
        guildId,
        source: "equipment",
        reason: `Unequip ${commit.itemId} from ${slot}`,
        metadata: {
          correlationId,
          itemId: commit.itemId,
          slot,
        },
      });

      return OkResult({
        guildId,
        userId,
        slot,
        itemId: commit.itemId,
        operation: "unequip" as const,
        correlationId,
        timestamp: new Date(),
      });
    });
  }
}

export const equipmentService: EquipmentService = new EquipmentServiceImpl();


