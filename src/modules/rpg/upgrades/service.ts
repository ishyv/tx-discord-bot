/**
 * RPG Upgrade Service.
 *
 * Purpose: Handle tool tier upgrades with instance-based durability.
 * Context: Consume tool instance + materials + money to create higher tier tool with full durability.
 * Dependencies: ItemMutationService, CurrencyMutationService, RpgEquipmentService.
 *
 * Invariants:
 * - Original tool instance consumed.
 * - Cannot upgrade if higher tier owned (inventory or equipped).
 * - New tool created with full durability for its tier.
 * - If tool was equipped, new tool is auto-equipped.
 * - One-way progression (no downgrades).
 */

import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { UserId } from "@/db/types";
import { economyAuditRepo } from "@/modules/economy/audit/repository";
import { itemMutationService } from "@/modules/economy/mutations/items/service";
import { currencyMutationService } from "@/modules/economy/mutations/service";
import {
  normalizeModernInventory,
  removeInstanceById,
  popInstances,
  addInstance,
} from "@/modules/inventory/inventory";
import { getTotalQuantity } from "@/modules/inventory/instances";
import { createInstance } from "@/modules/inventory/instances";
import { UserStore } from "@/db/repositories/users";
import { rpgProfileRepo } from "../profile/repository";
import { rpgEquipmentService } from "../equipment/service";
import { RpgError } from "../profile/types";
import type { UpgradeResult } from "./types";
import type { UpgradeInput, UpgradeInfo } from "./types";
import {
  getUpgradeInfo,
  generateUpgradedToolId,
  parseToolTier,
  canUpgradeTier,
  getUpgradeCost,
} from "./definitions";
import { UPGRADE_CONFIG } from "../config";
import { getToolDurability } from "../gathering/definitions";

export interface RpgUpgradeService {
  /**
   * Check if tool can be upgraded.
   */
  checkUpgrade(
    userId: UserId,
    toolId: string,
  ): Promise<Result<UpgradeInfo, RpgError>>;

  /**
   * Upgrade a tool to next tier.
   * If instanceId is provided, upgrades that specific instance.
   * Otherwise, upgrades the first available instance.
   */
  upgrade(input: UpgradeInput): Promise<Result<UpgradeResult, RpgError>>;

  /**
   * Get upgrade preview for a tool.
   */
  getUpgradePreview(
    userId: UserId,
    toolId: string,
    instanceId?: string,
  ): Promise<Result<{
    toolId: string;
    instanceId?: string;
    currentTier: number;
    nextTier: number;
    canUpgrade: boolean;
    reason?: string;
    cost: {
      money: number;
      materials: Array<{ id: string; quantity: number }>;
    };
    durability: {
      current: number;
      max: number;
      newMax: number;
    };
  }, RpgError>>;
}

class RpgUpgradeServiceImpl implements RpgUpgradeService {
  async checkUpgrade(
    userId: UserId,
    toolId: string,
  ): Promise<Result<UpgradeInfo, RpgError>> {
    // Get user data
    const userResult = await UserStore.get(userId);
    if (userResult.isErr() || !userResult.unwrap()) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "User not found"));
    }

    const user = userResult.unwrap()!;
    const inventory = normalizeModernInventory(user.inventory);
    const coins = (user.currency?.coins as { hand?: number } | undefined)?.hand ?? 0;

    // Build inventory record (check both inventory and equipment)
    const inventoryRecord: Record<string, { qty: number } | undefined> = {};
    for (const [key, value] of Object.entries(inventory)) {
      if (value) {
        inventoryRecord[key] = { qty: getTotalQuantity(value) };
      }
    }

    // Also check equipped items
    const profileResult = await rpgProfileRepo.findById(userId);
    if (profileResult.isOk() && profileResult.unwrap()) {
      const loadout = profileResult.unwrap()!.loadout;
      for (const equippedItem of Object.values(loadout)) {
        if (equippedItem) {
          const itemId = typeof equippedItem === "string" ? equippedItem : equippedItem.itemId;
          const existing = inventoryRecord[itemId];
          if (existing) {
            existing.qty += 1;
          } else {
            inventoryRecord[itemId] = { qty: 1 };
          }
        }
      }
    }

    const info = getUpgradeInfo(toolId, inventoryRecord, coins);
    return OkResult(info);
  }

  async getUpgradePreview(
    userId: UserId,
    toolId: string,
    instanceId?: string,
  ): Promise<Result<{
    toolId: string;
    instanceId?: string;
    currentTier: number;
    nextTier: number;
    canUpgrade: boolean;
    reason?: string;
    cost: {
      money: number;
      materials: Array<{ id: string; quantity: number }>;
    };
    durability: {
      current: number;
      max: number;
      newMax: number;
    };
  }, RpgError>> {
    const checkResult = await this.checkUpgrade(userId, toolId);
    if (checkResult.isErr()) {
      return ErrResult(checkResult.error);
    }

    const info = checkResult.unwrap();
    const currentTier = parseToolTier(toolId);
    const nextTier = Math.min(UPGRADE_CONFIG.maxTier, currentTier + 1);
    const requirements = getUpgradeCost(nextTier);

    // Get current durability if instance specified
    let currentDurability = 0;
    let maxDurability = getToolDurability(currentTier);

    if (instanceId) {
      const userResult = await UserStore.get(userId);
      if (userResult.isOk() && userResult.unwrap()) {
        const inventory = normalizeModernInventory(userResult.unwrap()!.inventory);
        const entry = inventory[toolId];
        if (entry?.type === "instances") {
          const instance = entry.instances.find(i => i.instanceId === instanceId);
          if (instance) {
            currentDurability = instance.durability;
          }
        }
      }
    }

    return OkResult({
      toolId,
      instanceId,
      currentTier,
      nextTier,
      canUpgrade: info.canUpgrade,
      reason: info.reason,
      cost: {
        money: requirements?.money ?? 0,
        materials: requirements?.materials.map(m => ({ id: m.id, quantity: m.qty })) ?? [],
      },
      durability: {
        current: currentDurability,
        max: maxDurability,
        newMax: getToolDurability(nextTier),
      },
    });
  }

  async upgrade(input: UpgradeInput): Promise<Result<UpgradeResult, RpgError>> {
    const correlationId = input.correlationId ?? this.generateCorrelationId();

    // Step 1: Validate profile
    const profileResult = await rpgProfileRepo.findById(input.userId);
    if (profileResult.isErr() || !profileResult.unwrap()) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "RPG profile not found"));
    }

    // Step 2: Check if in combat
    const profile = profileResult.unwrap()!;
    if (profile.isFighting) {
      return ErrResult(new RpgError("IN_COMBAT", "Cannot upgrade while in combat"));
    }

    // Step 3: Validate upgrade possible
    const checkResult = await this.checkUpgrade(input.userId, input.toolId);
    if (checkResult.isErr()) {
      return ErrResult(checkResult.error);
    }

    const upgradeInfo = checkResult.unwrap();
    if (!upgradeInfo.canUpgrade) {
      // Map reason to appropriate error code
      const reason = upgradeInfo.reason ?? "";
      if (reason.includes("maximum tier")) {
        return ErrResult(
          new RpgError("MAX_TIER_REACHED", reason),
        );
      }
      if (reason.includes("higher tier")) {
        return ErrResult(
          new RpgError("ALREADY_OWNS_HIGHER_TIER", reason),
        );
      }
      if (reason.includes("Insufficient funds") || reason.includes("coins")) {
        return ErrResult(
          new RpgError("INSUFFICIENT_FUNDS", reason),
        );
      }
      if (reason.includes("Insufficient")) {
        return ErrResult(
          new RpgError("INSUFFICIENT_MATERIALS", reason),
        );
      }
      return ErrResult(
        new RpgError("INVALID_UPGRADE", reason),
      );
    }

    const currentTier = parseToolTier(input.toolId);
    if (!canUpgradeTier(currentTier)) {
      return ErrResult(
        new RpgError("MAX_TIER_REACHED", "Tool is already at maximum tier (4)"),
      );
    }

    const requirements = upgradeInfo.requirements;
    const nextTier = currentTier + 1;
    const newToolId = generateUpgradedToolId(input.toolId, nextTier);

    // Step 4: Handle equipped tool
    // We must unequip it first to ensure it is in inventory for consumption
    let wasEquipped = false;
    const equippedSlot = profile.loadout.weapon;
    let equippedItemId: string | null = null;
    let equippedInstanceId: string | undefined;

    if (equippedSlot) {
      if (typeof equippedSlot === "string") {
        equippedItemId = equippedSlot;
      } else {
        equippedItemId = equippedSlot.itemId;
        equippedInstanceId = equippedSlot.instanceId;
      }
    }

    // Check if the tool to upgrade is currently equipped
    if (equippedItemId === input.toolId) {
      // If specific instance requested, check if it matches equipped
      if (!input.instanceId || (equippedInstanceId && input.instanceId === equippedInstanceId)) {
        wasEquipped = true;
        // Unequip it
        const unequipResult = await rpgEquipmentService.unequip(
          input.userId,
          input.actorId,
          "weapon",
          input.guildId,
        );
        if (unequipResult.isErr()) {
          return ErrResult(new RpgError("UPDATE_FAILED", "Failed to unequip tool before upgrade: " + unequipResult.error.message));
        }
      }
    }

    // Step 5: Get user and inventory (after potential unequip)
    const userResult = await UserStore.get(input.userId);
    if (userResult.isErr() || !userResult.unwrap()) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "User not found"));
    }
    const user = userResult.unwrap()!;
    let inventory = normalizeModernInventory(user.inventory);

    // Step 6: Consume tool instance
    let consumedInstanceId: string | undefined;

    if (input.instanceId) {
      // Consume specific instance
      const result = removeInstanceById(inventory, input.toolId, input.instanceId);
      if (!result.removed) {
        return ErrResult(
          new RpgError("INSTANCE_NOT_FOUND", `Tool instance ${input.instanceId} not found`),
        );
      }
      inventory = result.inventory;
      consumedInstanceId = input.instanceId;
    } else {
      // Consume first available instance
      const result = popInstances(inventory, input.toolId, 1);
      if (result.removed.length === 0) {
        return ErrResult(
          new RpgError("INSUFFICIENT_MATERIALS", `No ${input.toolId} found in inventory`),
        );
      }
      inventory = result.inventory;
      consumedInstanceId = result.removed[0]!.instanceId;
    }

    // Save inventory after removing tool
    const saveResult = await UserStore.patch(input.userId, { inventory } as any);
    if (saveResult.isErr()) {
      return ErrResult(
        new RpgError("UPDATE_FAILED", "Failed to update inventory after consuming tool"),
      );
    }

    // Step 6: Consume materials
    for (const material of requirements.materials) {
      const removeMaterialResult = await itemMutationService.adjustItemQuantity(
        {
          actorId: input.actorId,
          targetId: input.userId,
          guildId: input.guildId,
          itemId: material.id,
          delta: -(material.qty as number),
          reason: `Upgrade material for ${newToolId}`,
        },
        async () => true,
      );

      if (removeMaterialResult.isErr()) {
        // Try to restore tool on failure
        await this.rollbackTool(input, input.toolId);
        return ErrResult(
          new RpgError(
            "INSUFFICIENT_MATERIALS",
            `Failed to consume ${material.id}: ${removeMaterialResult.error.message}`,
          ),
        );
      }
    }

    // Step 7: Deduct money
    if (requirements.money > 0) {
      const deductResult = await currencyMutationService.adjustCurrencyBalance(
        {
          actorId: input.actorId,
          targetId: input.userId,
          guildId: input.guildId,
          currencyId: "coins",
          delta: -requirements.money,
          reason: `Upgrade tool to tier ${nextTier}`,
        },
        async () => true,
      );

      if (deductResult.isErr()) {
        // Try to restore tool and materials
        await this.rollbackTool(input, input.toolId);
        await this.rollbackMaterials(input, requirements.materials);

        return ErrResult(
          new RpgError(
            "INSUFFICIENT_FUNDS",
            `Failed to deduct money: ${deductResult.error.message}`,
          ),
        );
      }
    }

    // Step 8: Create new tool instance with full durability
    const newMaxDurability = getToolDurability(nextTier);
    const newInstance = createInstance(newToolId, newMaxDurability);

    // Get fresh inventory and add new instance
    const freshUserResult = await UserStore.get(input.userId);
    if (freshUserResult.isOk() && freshUserResult.unwrap()) {
      inventory = normalizeModernInventory(freshUserResult.unwrap()!.inventory);
      inventory = addInstance(inventory, newInstance);

      const saveNewResult = await UserStore.patch(input.userId, { inventory } as any);
      if (saveNewResult.isErr()) {
        console.error("[RpgUpgradeService] Failed to save new tool:", saveNewResult.error);
      }
    }

    // Step 9: If tool was equipped, equip the new one
    if (wasEquipped) {
      const equipResult = await rpgEquipmentService.equip({
        userId: input.userId,
        itemId: newToolId,
        slot: "weapon",
        actorId: input.actorId,
        guildId: input.guildId,
      });
      if (equipResult.isErr()) {
        console.error("[RpgUpgradeService] Failed to equip new tool:", equipResult.error);
      }
    }

    // Step 10: Audit
    await economyAuditRepo.create({
      operationType: "item_purchase",
      actorId: input.actorId,
      targetId: input.userId,
      guildId: input.guildId,
      source: "rpg-upgrade",
      reason: `Upgraded ${input.toolId} (instance: ${consumedInstanceId}) to ${newToolId} (instance: ${newInstance.instanceId})`,
      itemData: {
        itemId: newToolId,
        quantity: 1,
      },
      metadata: {
        correlationId,
        originalToolId: input.toolId,
        originalInstanceId: consumedInstanceId,
        newToolId,
        newInstanceId: newInstance.instanceId,
        tier: nextTier,
        moneySpent: requirements.money,
        materialsConsumed: requirements.materials.map(m => ({ id: m.id, quantity: m.qty })) as unknown as Array<{ id: string; quantity: number }>,
      },
    });

    return OkResult({
      userId: input.userId,
      originalToolId: input.toolId,
      newToolId,
      newTier: nextTier,
      moneySpent: requirements.money,
      materialsConsumed: requirements.materials.map(m => ({ id: m.id, quantity: m.qty })),
      correlationId,
      timestamp: new Date(),
    });
  }

  private async rollbackTool(input: UpgradeInput, toolId: string): Promise<void> {
    await itemMutationService.adjustItemQuantity(
      {
        actorId: input.actorId,
        targetId: input.userId,
        guildId: input.guildId,
        itemId: toolId,
        delta: 1,
        reason: `Rollback upgrade - failed`,
      },
      async () => true,
    );
  }

  private async rollbackMaterials(
    input: UpgradeInput,
    materials: Array<{ id: string; qty: number }>,
  ): Promise<void> {
    for (const material of materials) {
      await itemMutationService.adjustItemQuantity(
        {
          actorId: input.actorId,
          targetId: input.userId,
          guildId: input.guildId,
          itemId: material.id,
          delta: material.qty,
          reason: `Rollback upgrade - failed`,
        },
        async () => true,
      );
    }
  }

  private generateCorrelationId(): string {
    return `rpg_upgrade_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

/** Singleton instance. */
export const rpgUpgradeService: RpgUpgradeService = new RpgUpgradeServiceImpl();
