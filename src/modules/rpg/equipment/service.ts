/**
 * RPG Equipment Service.
 *
 * Purpose: Handle equipment changes with inventory integration.
 * Context: Equip/unequip items, respecting combat lock and capacity.
 * Dependencies: RpgProfileRepo, UserStore, StatsCalculator, Capacity utils.
 *
 * Invariants:
 * - Equipment changes blocked during combat (isFighting check).
 * - Unequipped items return to inventory only if capacity allows.
 * - Stats recalculated and HP clamped after equipment changes.
 * - All operations use atomic CAS transitions.
 * - All operations are audited.
 */

import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { UserId } from "@/db/types";
import { economyAuditRepo } from "@/modules/economy/audit/repository";
import { perkService } from "@/modules/economy/perks/service";
import { UserStore } from "@/db/repositories/users";
import { runUserTransition } from "@/db/user-transition";
import type { ModernInventory } from "@/modules/inventory/inventory";
import {
  normalizeModernInventory,
  addInstance,
  popInstances,
  removeInstanceById,
  getModernItemQuantity,
} from "@/modules/inventory/inventory";
import {
  simulateModernCapacityAfterAdd,
  type CapacityLimits,
} from "@/modules/inventory/capacity";
import { getItemDefinition } from "@/modules/inventory/items";
import { isInstanceBased, createInstance } from "@/modules/inventory/instances";
import type { ItemId } from "@/modules/inventory/definitions";
import { rpgProfileRepo } from "../profile/repository";
import { RpgError } from "../profile/types";
import type { Loadout, EquipmentSlot } from "@/db/schemas/rpg-profile";
import { calcStats } from "../stats/calculator";
import type { ItemStatsResolver } from "@/modules/rpg/stats/calculator";
import { EQUIPMENT_SLOTS } from "../config";
import {
  type EquipmentOperationInput,
  type EquipmentChangeResult,
  type RpgEquipmentService,
} from "./types";

/** Default item resolver using inventory definitions. */
const defaultItemResolver: ItemStatsResolver = (itemId: string) => {
  const def = getItemDefinition(itemId);
  if (!def) return null;
  return {
    atk: def.stats?.atk,
    def: def.stats?.def,
    hp: def.stats?.hp,
  };
};

/** Check if item can be equipped to slot based on item definition. */
function canEquipToSlot(itemDef: ReturnType<typeof getItemDefinition>, slot: EquipmentSlot): boolean {
  if (!itemDef) return false;
  return itemDef.rpgSlot === slot || (slot === "weapon" && itemDef.rpgSlot === "tool");
}

/** Get capacity limits for user. */
async function getUserCapacityLimits(
  guildId: string | undefined,
  userId: UserId,
): Promise<CapacityLimits> {
  if (!guildId) {
    return { maxWeight: 200, maxSlots: 20 };
  }
  const limitsResult = await perkService.getCapacityLimits(guildId, userId);
  if (limitsResult.isOk()) {
    return limitsResult.unwrap();
  }
  return { maxWeight: 200, maxSlots: 20 };
}

class RpgEquipmentServiceImpl implements RpgEquipmentService {
  /**
   * Equip an item from inventory to a slot.
   * If slot is occupied, auto-unequips existing item (if inventory allows).
   * Updates HP if max HP changes.
   */
  async equip(
    input: EquipmentOperationInput,
  ): Promise<Result<EquipmentChangeResult, RpgError>> {
    const correlationId = input.correlationId ?? this.generateCorrelationId();

    // Get profile and validate not in combat
    const profileResult = await rpgProfileRepo.findById(input.userId);
    if (profileResult.isErr()) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "Could not load profile"));
    }
    const profile = profileResult.unwrap();
    if (!profile) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "RPG profile not found"));
    }
    if (profile.isFighting) {
      return ErrResult(new RpgError("IN_COMBAT", "Cannot change equipment while in combat"));
    }

    // Validate slot
    if (!EQUIPMENT_SLOTS.includes(input.slot as EquipmentSlot)) {
      return ErrResult(new RpgError("INVALID_EQUIPMENT_SLOT", `Invalid slot: ${input.slot}`));
    }

    // For equip: validate item exists and can be equipped to slot
    if (input.itemId !== null) {
      const itemDef = getItemDefinition(input.itemId);
      if (!itemDef) {
        return ErrResult(new RpgError("ITEM_NOT_IN_INVENTORY", "Item not found"));
      }
      if (!canEquipToSlot(itemDef, input.slot as EquipmentSlot)) {
        return ErrResult(
          new RpgError("INVALID_EQUIPMENT_SLOT", `Item cannot be equipped to ${input.slot}`),
        );
      }
    }

    // Resolve previous item details
    const rawPrevious = profile.loadout[input.slot as EquipmentSlot];
    let previousItemId: string | null = null;
    let previousInstanceId: string | undefined;
    let previousDurability: number | undefined;

    if (rawPrevious) {
      if (typeof rawPrevious === "string") {
        previousItemId = rawPrevious;
      } else {
        previousItemId = rawPrevious.itemId;
        previousInstanceId = rawPrevious.instanceId;
        previousDurability = rawPrevious.durability;
      }
    }

    const limits = await getUserCapacityLimits(input.guildId, input.userId);
    const isNewItemInstanced = input.itemId !== null && isInstanceBased(input.itemId);
    const isPreviousItemInstanced = previousItemId !== null && isInstanceBased(previousItemId);

    // Perform atomic equipment transition
    return runUserTransition<
      { inventory: ModernInventory; profile: typeof profile },
      { inventory: ModernInventory; loadout: Loadout; hpCurrent: number; equippedInstanceId?: string },
      EquipmentChangeResult
    >(input.userId, {
      getSnapshot: (user) => ({
        inventory: normalizeModernInventory(user.inventory),
        profile: profile,
      }),
      computeNext: (snapshot): Result<{ inventory: ModernInventory; loadout: Loadout; hpCurrent: number; equippedInstanceId?: string }, Error> => {
        const inventory: ModernInventory = { ...snapshot.inventory };
        const loadout: Loadout = { ...snapshot.profile.loadout };
        let equippedInstanceId: string | undefined;

        // Step 1: Handle unequip of current item (if any)
        if (previousItemId !== null) {
          // Check capacity for returning item
          const capacityCheck = simulateModernCapacityAfterAdd(inventory, previousItemId as ItemId, 1, { limits });
          if (capacityCheck.weightExceeded || capacityCheck.slotsExceeded) {
            return ErrResult(new Error("INVENTORY_FULL"));
          }

          // Add previous item back to inventory
          if (isPreviousItemInstanced) {
            // If we have an instance ID (new format), restore that specific instance
            if (previousInstanceId && previousDurability !== undefined) {
              const instanceToReturn = {
                instanceId: previousInstanceId,
                itemId: previousItemId,
                durability: previousDurability,
              };
              const updatedInventory = addInstance(inventory, instanceToReturn);
              Object.assign(inventory, updatedInventory);
            } else {
              // Migration/Fallback: We had a string or missing instance data.
              // Create a BRAND NEW instance to "repair" the lost instance state.
              const newInstance = createInstance(previousItemId);
              const updatedInventory = addInstance(inventory, newInstance);
              Object.assign(inventory, updatedInventory);
            }
          } else {
            // For stackables, increment quantity
            const prevEntry = inventory[previousItemId];
            if (prevEntry?.type === "stackable") {
              inventory[previousItemId] = { type: "stackable", quantity: prevEntry.quantity + 1 };
            } else {
              inventory[previousItemId] = { type: "stackable", quantity: 1 };
            }
          }
        }

        // Step 2: Handle equip of new item
        if (input.itemId !== null) {
          // Verify item is in inventory
          const availableQty = getModernItemQuantity(inventory, input.itemId);
          if (availableQty < 1) {
            return ErrResult(new Error("ITEM_NOT_IN_INVENTORY"));
          }

          if (isNewItemInstanced) {
            // Remove instance from inventory
            let removedInstance;

            if (input.instanceId) {
              // Try to remove specific instance
              const result = removeInstanceById(inventory, input.itemId, input.instanceId);
              if (!result.removed) {
                return ErrResult(new Error("INSTANCE_NOT_FOUND"));
              }
              removedInstance = result.removed;
              Object.assign(inventory, result.inventory);
            } else {
              // Fallback: pop any instance (first one)
              const { inventory: newInv, removed } = popInstances(inventory, input.itemId, 1);
              if (removed.length === 0) {
                return ErrResult(new Error("ITEM_NOT_IN_INVENTORY"));
              }
              removedInstance = removed[0];
              Object.assign(inventory, newInv);
            }

            equippedInstanceId = removedInstance.instanceId;

            // Update loadout with full instance object
            (loadout as any)[input.slot] = {
              itemId: input.itemId,
              instanceId: removedInstance.instanceId,
              durability: removedInstance.durability
            };

          } else {
            // Stackable handling
            const entry = inventory[input.itemId];
            if (entry?.type === "stackable") {
              if (entry.quantity <= 1) {
                delete inventory[input.itemId];
              } else {
                inventory[input.itemId] = { type: "stackable", quantity: entry.quantity - 1 };
              }
            } else {
              return ErrResult(new Error("ITEM_NOT_IN_INVENTORY")); // Should not happen given earlier checks
            }
            // Store as string for stackables
            (loadout as any)[input.slot] = input.itemId;
          }
        } else {
          // Unequip only
          (loadout as any)[input.slot] = null;
        }

        // Step 3: Update loadout stats...
        // Note: We need a resolver that can handle objects now?
        // defaultItemResolver only takes itemId.
        // But calcStats likely iterates values.
        // We need to ensure calcStats handles objects or we map loadout to itemIds before passing.

        // Map loadout values to itemIds for stats calculation
        const statsLoadout: Record<string, string | null> = {};
        for (const [key, val] of Object.entries(loadout)) {
          if (val && typeof val === 'object') {
            statsLoadout[key] = val.itemId;
          } else {
            statsLoadout[key] = val as string | null;
          }
        }

        const newStats = calcStats(statsLoadout as Loadout, defaultItemResolver);
        // We also need oldStats to compare maxHp
        const oldStatsLoadout: Record<string, string | null> = {};
        for (const [key, val] of Object.entries(snapshot.profile.loadout)) {
          if (val && typeof val === 'object') {
            oldStatsLoadout[key] = val.itemId;
          } else {
            oldStatsLoadout[key] = val as string | null;
          }
        }
        const oldStats = calcStats(oldStatsLoadout as Loadout, defaultItemResolver);

        const newHpCurrent = newStats.maxHp < oldStats.maxHp
          ? Math.min(snapshot.profile.hpCurrent, newStats.maxHp)
          : snapshot.profile.hpCurrent;

        return OkResult({ inventory, loadout, hpCurrent: newHpCurrent, equippedInstanceId });
      },
      commit: async (userId, _expected, next) => {
        // Update inventory and profile
        const updateResult = await UserStore.patch(userId, {
          inventory: next.inventory,
          rpgProfile: {
            ...profile,
            loadout: next.loadout,
            hpCurrent: next.hpCurrent,
            updatedAt: new Date(),
            version: profile.version + 1,
          },
        } as any);
        return updateResult;
      },
      project: (_updatedUser, next): EquipmentChangeResult => {
        // Re-calculate stats for return value
        const statsLoadout: Record<string, string | null> = {};
        for (const [key, val] of Object.entries(next.loadout)) {
          if (val && typeof val === 'object') {
            statsLoadout[key] = val.itemId;
          } else {
            statsLoadout[key] = val as string | null;
          }
        }
        const stats = calcStats(statsLoadout as Loadout, defaultItemResolver);

        return {
          userId: input.userId,
          slot: input.slot,
          operation: input.itemId === null ? "unequip" : "equip",
          previousItemId,
          newItemId: input.itemId,
          equippedInstanceId: next.equippedInstanceId,
          stats,
          currentHp: next.hpCurrent,
          correlationId,
          timestamp: new Date(),
        };
      },
      conflictError: "RPG_EQUIP_CONFLICT",
    }).then(async (result) => {
      if (result.isErr()) {
        const err = result.error;
        if (err instanceof Error && err.message === "INVENTORY_FULL") {
          return ErrResult(new RpgError("UPDATE_FAILED", "Inventory is full - cannot unequip current item"));
        }
        if (err instanceof Error && err.message === "ITEM_NOT_IN_INVENTORY") {
          return ErrResult(new RpgError("ITEM_NOT_IN_INVENTORY", "Item not found in inventory"));
        }
        if (err instanceof Error && err.message === "INSTANCE_NOT_FOUND") {
          return ErrResult(new RpgError("ITEM_NOT_IN_INVENTORY", "Specific instance not found in inventory"));
        }
        return ErrResult(new RpgError("UPDATE_FAILED", "Failed to update equipment"));
      }

      const changeResult = result.unwrap();

      // Audit
      await economyAuditRepo.create({
        operationType: input.itemId === null ? "item_unequip" : "item_equip",
        actorId: input.actorId,
        targetId: input.userId,
        guildId: input.guildId,
        source: "rpg-equipment",
        reason: input.reason ?? `${changeResult.operation} ${input.slot}`,
        itemData: {
          itemId: input.itemId ?? previousItemId ?? "unknown",
          quantity: 1,
        },
        metadata: {
          correlationId,
          slot: input.slot,
          previousItemId,
          newItemId: input.itemId,
          statsAfter: changeResult.stats,
          hpCurrent: changeResult.currentHp,
          equippedInstanceId: changeResult.equippedInstanceId // Add to metadata
        },
      });

      return OkResult(changeResult);
    });
  }

  /**
   * Unequip an item from a slot and return to inventory.
   * Fails if inventory capacity would be exceeded.
   */
  async unequip(
    userId: UserId,
    actorId: UserId,
    slot: EquipmentSlot,
    guildId?: string,
    correlationId?: string,
  ): Promise<Result<EquipmentChangeResult, RpgError>> {
    return this.equip({
      userId,
      actorId,
      guildId,
      slot,
      itemId: null,
      correlationId,
      reason: "Manual unequip",
    });
  }

  /**
   * Unequip all items.
   * Stops on first failure (partial unequip possible).
   */
  async unequipAll(
    userId: UserId,
    actorId: UserId,
    guildId?: string,
  ): Promise<Result<EquipmentChangeResult[], RpgError>> {
    const profileResult = await rpgProfileRepo.findById(userId);
    if (profileResult.isErr() || !profileResult.unwrap()) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "Profile not found"));
    }

    const profile = profileResult.unwrap()!;
    const results: EquipmentChangeResult[] = [];

    // Unequip each slot that has an item
    for (const slot of EQUIPMENT_SLOTS) {
      const itemId = profile.loadout[slot];
      if (itemId !== null) {
        const result = await this.equip({
          userId,
          actorId,
          guildId,
          slot,
          itemId: null,
          reason: "Unequip all",
        });

        if (result.isErr()) {
          return ErrResult(result.error);
        }
        results.push(result.unwrap());
      }
    }

    return OkResult(results);
  }

  private generateCorrelationId(): string {
    return `rpg_equip_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

/** Singleton instance. */
export const rpgEquipmentService: RpgEquipmentService = new RpgEquipmentServiceImpl();
