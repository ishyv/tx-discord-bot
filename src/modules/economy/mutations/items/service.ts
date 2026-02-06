/**
 * Item Mutation Service.
 *
 * Purpose: Mod-only item adjustments with inventory capacity constraints.
 * Constraints:
 * - Weight-based capacity (default 200)
 * - Slot-based capacity (default 20 distinct items)
 * - Stackable vs non-stackable rules
 */

import { UserStore } from "@/db/repositories/users";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { UserId } from "@/db/types";
import type { ItemId } from "@/modules/inventory/definitions";
import type { ItemInventory } from "@/modules/inventory/inventory";
import {
  calculateCapacity,
  simulateCapacityAfterAdd,
  type CapacityLimits,
} from "@/modules/inventory/capacity";
import { economyAccountRepo } from "../../account/repository";
import { economyAuditRepo } from "../../audit/repository";
import {
  ItemMutationError,
  type AdjustItemQuantityInput,
  type AdjustItemQuantityResult,
} from "./types";
import { validateItemIdDetailed } from "./validation";
import { perkService } from "../../perks/service";

/** Check if capacity allows the addition. */
function checkCapacity(
  inventory: ItemInventory,
  itemId: ItemId,
  quantity: number,
  force: boolean,
  limits?: CapacityLimits,
): Result<void, ItemMutationError> {
  if (quantity <= 0) return OkResult(undefined);

  const simulated = simulateCapacityAfterAdd(inventory, itemId, quantity, {
    limits,
  });

  if (!force && simulated.weightExceeded) {
    return ErrResult(
      new ItemMutationError(
        "CAPACITY_EXCEEDED",
        `Límite de peso excedido (${simulated.currentWeight}/${simulated.maxWeight})`,
      ),
    );
  }

  if (!force && simulated.slotsExceeded) {
    return ErrResult(
      new ItemMutationError(
        "CAPACITY_EXCEEDED",
        `Límite de slots excedido (${simulated.currentSlots}/${simulated.maxSlots})`,
      ),
    );
  }

  return OkResult(undefined);
}

/** Get quantity of an item in inventory. */
function getItemQuantity(inventory: ItemInventory, itemId: ItemId): number {
  return inventory[itemId]?.quantity ?? 0;
}

/** Build the update path for an item. */
function buildItemUpdate(
  inventory: ItemInventory,
  itemId: ItemId,
  delta: number,
): { path: string; value: unknown; shouldDelete: boolean } {
  const currentQty = getItemQuantity(inventory, itemId);
  const newQty = currentQty + delta;

  if (newQty <= 0) {
    // Remove item entry
    return {
      path: `inventory.${itemId}`,
      value: undefined,
      shouldDelete: true,
    };
  }

  return {
    path: `inventory.${itemId}`,
    value: { id: itemId, quantity: newQty },
    shouldDelete: false,
  };
}

export interface ItemMutationService {
  /**
   * Adjust item quantity with capacity constraints.
   */
  adjustItemQuantity(
    input: AdjustItemQuantityInput,
    checkAdmin: (actorId: UserId, guildId?: string) => Promise<boolean>,
  ): Promise<Result<AdjustItemQuantityResult, ItemMutationError>>;
}

class ItemMutationServiceImpl implements ItemMutationService {
  async adjustItemQuantity(
    input: AdjustItemQuantityInput,
    checkAdmin: (actorId: UserId, guildId?: string) => Promise<boolean>,
  ): Promise<Result<AdjustItemQuantityResult, ItemMutationError>> {
    const {
      actorId,
      targetId,
      guildId,
      itemId: rawItemId,
      delta,
      reason,
      force,
    } = input;

    // Step 1: Check admin permission
    const hasPermission = await checkAdmin(actorId, guildId);
    if (!hasPermission) {
      return ErrResult(
        new ItemMutationError(
          "INSUFFICIENT_PERMISSIONS",
          "You do not have permission to perform this action.",
        ),
      );
    }

    // Step 2: Validate and sanitize item ID
    const itemValidation = validateItemIdDetailed(rawItemId);
    if (!itemValidation.valid) {
      return ErrResult(
        new ItemMutationError("ITEM_NOT_FOUND", itemValidation.reason),
      );
    }
    const itemId = itemValidation.canonicalId;

    // Step 3: Validate quantity
    if (!Number.isFinite(delta) || delta === 0) {
      return ErrResult(
        new ItemMutationError(
          "INVALID_QUANTITY",
          "Amount must be a non-zero number.",
        ),
      );
    }

    // Step 4: Ensure target account exists
    const ensureResult = await economyAccountRepo.ensure(targetId);
    if (ensureResult.isErr()) {
      return ErrResult(
        new ItemMutationError(
          "TARGET_NOT_FOUND",
          "Could not access the target account.",
        ),
      );
    }

    // Step 5: Gate on target status
    const targetAccount = ensureResult.unwrap().account;
    if (targetAccount.status === "banned") {
      return ErrResult(
        new ItemMutationError(
          "TARGET_BANNED",
          "The target account has permanent restrictions.",
        ),
      );
    }
    if (targetAccount.status === "blocked") {
      return ErrResult(
        new ItemMutationError(
          "TARGET_BLOCKED",
          "The target account has temporary restrictions.",
        ),
      );
    }

    // Step 6: Get current inventory
    const userResult = await UserStore.get(targetId);
    if (userResult.isErr() || !userResult.unwrap()) {
      return ErrResult(
        new ItemMutationError("TARGET_NOT_FOUND", "User not found."),
      );
    }

    const user = userResult.unwrap()!;
    const inventory = (user.inventory ?? {}) as ItemInventory;
    const beforeQuantity = getItemQuantity(inventory, itemId);

    // Step 7: Check capacity constraints (only for additions)
    if (delta > 0) {
      let limits: CapacityLimits | undefined;
      if (guildId) {
        const limitsResult = await perkService.getCapacityLimits(
          guildId,
          targetId,
        );
        if (limitsResult.isOk()) {
          limits = limitsResult.unwrap();
        }
      }

      const capacityCheck = checkCapacity(
        inventory,
        itemId,
        delta,
        force ?? false,
        limits,
      );
      if (capacityCheck.isErr()) {
        return ErrResult(capacityCheck.error);
      }
    }

    // Step 8: Check removal constraints (cannot remove more than available)
    if (delta < 0 && Math.abs(delta) > beforeQuantity) {
      return ErrResult(
        new ItemMutationError(
          "INVALID_QUANTITY",
          `No se pueden remover más items de los que posee (${beforeQuantity}).`,
        ),
      );
    }

    // Step 9: Perform atomic update
    const update = buildItemUpdate(inventory, itemId, delta);
    const correlationId = `item_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    try {
      const col = await UserStore.collection();
      const now = new Date();

      if (update.shouldDelete) {
        // Remove item field
        await col.updateOne({ _id: targetId } as any, {
          $unset: { [update.path]: "" } as any,
          $set: { updatedAt: now } as any,
        });
      } else {
        // Set item value
        await col.updateOne({ _id: targetId } as any, {
          $set: { [update.path]: update.value, updatedAt: now } as any,
        });
      }
    } catch (error) {
      return ErrResult(
        new ItemMutationError(
          "UPDATE_FAILED",
          "Error updating inventory.",
        ),
      );
    }

    // Step 10: Get updated state
    const updatedUserResult = await UserStore.get(targetId);
    if (updatedUserResult.isErr() || !updatedUserResult.unwrap()) {
      return ErrResult(
        new ItemMutationError(
          "UPDATE_FAILED",
          "Error getting updated state.",
        ),
      );
    }

    const updatedInventory = (updatedUserResult.unwrap()!.inventory ??
      {}) as ItemInventory;
    const afterQuantity = getItemQuantity(updatedInventory, itemId);
    let limits: CapacityLimits | undefined;
    if (guildId) {
      const limitsResult = await perkService.getCapacityLimits(
        guildId,
        targetId,
      );
      if (limitsResult.isOk()) {
        limits = limitsResult.unwrap();
      }
    }

    const capacity = calculateCapacity(updatedInventory, { limits });

    // Step 11: Create audit entry
    const auditResult = await economyAuditRepo.create({
      operationType: "item_grant",
      actorId,
      targetId,
      guildId,
      source: delta > 0 ? "give-item" : "remove-item",
      reason,
      itemData: {
        itemId,
        quantity: Math.abs(delta),
        beforeQuantity,
        afterQuantity,
      },
      metadata: {
        correlationId,
        delta,
        force: force ?? false,
        capacityBefore: calculateCapacity(inventory, { limits }),
        capacityAfter: capacity,
      },
    });

    if (auditResult.isErr()) {
      console.error(
        "[ItemMutationService] Failed to create audit entry:",
        auditResult.error,
      );
    }

    // Step 12: Return result
    return OkResult({
      targetId,
      itemId,
      delta,
      beforeQuantity,
      afterQuantity,
      capacity,
      timestamp: new Date(),
    });
  }
}

export const itemMutationService: ItemMutationService =
  new ItemMutationServiceImpl();


