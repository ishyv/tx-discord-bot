/**
 * RPG Gathering Service (Instance-Based).
 *
 * Purpose: Handle mining and woodcutting with instance-based tool durability.
 * Context: Gather raw materials using equipped tools that degrade per use.
 * Dependencies: ItemInstanceService, RpgProfileRepo, RpgEquipmentService.
 *
 * Invariants:
 * - Tool must be equipped in weapon slot.
 * - Tool tier must meet location tier requirement.
 * - Each use consumes 1 durability from the instance.
 * - Tool breaks at 0 durability, removed from inventory and equipment.
 * - Yields 2-5 materials per success (stackable).
 */

import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { UserId } from "@/db/types";
import { economyAuditRepo } from "@/modules/economy/audit/repository";
import { itemMutationService } from "@/modules/economy/mutations/items/service";
import { rpgProfileRepo } from "../profile/repository";
import { RpgError } from "../profile/types";
import type { GatheringResult } from "./types";
import {
  getLocation,
  isValidGatheringTool,
  getToolTierFromItemId,
  calculateYield,
  getLocationMaterial,
} from "./definitions";
import { getToolKind } from "@/modules/inventory/items";
import { getContentRegistry, type ContentDropEntry } from "@/modules/content";
import type { Profession } from "@/modules/content";

/** Tool info from equipped instance. */
interface EquippedToolInfo {
  itemId: string;
  instanceId: string;
  tier: number;
  toolKind: "pickaxe" | "axe";
  durability: number;
}

function randomIntInclusive(min: number, max: number): number {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

function pickWeightedDrop(entries: readonly ContentDropEntry[]): ContentDropEntry {
  if (entries.length === 1) {
    return entries[0]!;
  }

  const totalWeight = entries.reduce((acc, entry) => acc + entry.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry;
    }
  }

  return entries[entries.length - 1]!;
}

export interface RpgGatheringService {
  /**
   * Mine at a location (requires equipped pickaxe).
   */
  mine(
    userId: UserId,
    locationId: string,
    actorId: UserId,
    guildId?: string,
  ): Promise<Result<GatheringResult, RpgError>>;

  /**
   * Cut down trees at a location (requires equipped axe).
   */
  cutdown(
    userId: UserId,
    locationId: string,
    actorId: UserId,
    guildId?: string,
  ): Promise<Result<GatheringResult, RpgError>>;

  /**
   * Get currently equipped tool info.
   */
  getEquippedTool(userId: UserId): Promise<EquippedToolInfo | null>;
}

class RpgGatheringServiceImpl implements RpgGatheringService {
  async mine(
    userId: UserId,
    locationId: string,
    actorId: UserId,
    guildId?: string,
  ): Promise<Result<GatheringResult, RpgError>> {
    return this.gather(userId, locationId, actorId, "mine", guildId);
  }

  async cutdown(
    userId: UserId,
    locationId: string,
    actorId: UserId,
    guildId?: string,
  ): Promise<Result<GatheringResult, RpgError>> {
    return this.gather(userId, locationId, actorId, "forest", guildId);
  }

  private async gather(
    userId: UserId,
    locationId: string,
    actorId: UserId,
    expectedType: "mine" | "forest",
    guildId?: string,
  ): Promise<Result<GatheringResult, RpgError>> {
    const correlationId = `gather_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // Step 1: Validate profile
    const profileResult = await rpgProfileRepo.findById(userId);
    if (profileResult.isErr() || !profileResult.unwrap()) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "RPG profile not found"));
    }
    const profile = profileResult.unwrap()!;

    // Step 2: Validate location
    const location = getLocation(locationId);
    if (!location) {
      return ErrResult(new RpgError("LOCATION_NOT_FOUND", "Location not found"));
    }

    // Validate location type matches action
    if (location.type !== expectedType) {
      const actionName = expectedType === "mine" ? "mining" : "woodcutting";
      return ErrResult(
        new RpgError(
          "LOCATION_NOT_FOUND",
          `This location is not suitable for ${actionName}`,
        ),
      );
    }

    // Step 3: Get equipped tool from weapon slot
    // Handle both string (legacy) and object (instanced) formats
    const equipped = profile.loadout.weapon;

    if (!equipped) {
      return ErrResult(
        new RpgError("NO_TOOL_EQUIPPED", `Equip a ${expectedType === "mine" ? "pickaxe" : "axe"} first`),
      );
    }

    let equippedItemId: string;
    let currentDurability: number;
    let instanceId: string;

    if (typeof equipped === "string") {
      equippedItemId = equipped;
      // Legacy: Assume max durability or require re-equip
      // For smoother UX, we can fail and ask to re-equip
      return ErrResult(
        new RpgError(
          "INVALID_EQUIPMENT_SLOT",
          "Please unequip and re-equip your tool to use it (System Update).",
        ),
      );
    } else {
      equippedItemId = equipped.itemId;
      currentDurability = equipped.durability;
      instanceId = equipped.instanceId;
    }

    // Step 4: Validate tool type
    if (!isValidGatheringTool(equippedItemId, location.type)) {
      const expectedTool = expectedType === "mine" ? "pickaxe" : "axe";
      return ErrResult(
        new RpgError(
          "INVALID_EQUIPMENT_SLOT",
          `Equip a ${expectedTool} to ${expectedType === "mine" ? "mine" : "cut down trees"}`,
        ),
      );
    }

    const toolTier = getToolTierFromItemId(equippedItemId);

    // Step 6: Validate tier requirement
    if (toolTier < location.requiredTier) {
      return ErrResult(
        new RpgError(
          "INSUFFICIENT_TOOL_TIER",
          `Your tool (tier ${toolTier}) is too weak for this location (requires tier ${location.requiredTier})`,
        ),
      );
    }

    // Step 7: Decrement durability directly on loadout
    const newDurability = currentDurability - 1;
    let toolBroken = false;
    let newLoadout = { ...profile.loadout };

    if (newDurability <= 0) {
      toolBroken = true;
      newLoadout.weapon = null; // Remove broken tool
    } else {
      // Update durability in loadout
      newLoadout.weapon = {
        itemId: equippedItemId,
        instanceId: instanceId,
        durability: newDurability
      };
    }

    // Save profile with new loadout
    const updateResult = await rpgProfileRepo.updateLoadout(userId, newLoadout);
    if (updateResult.isErr()) {
      return ErrResult(new RpgError("UPDATE_FAILED", "Failed to save tool durability"));
    }

    const remainingDurability = toolBroken ? 0 : newDurability;

    // Step 9: Calculate and grant yield (content-first drop tables, fallback to legacy)
    const registry = getContentRegistry();
    const profession = (profile.starterKitType ??
      (expectedType === "mine" ? "miner" : "lumber")) as Profession;

    const contentDrops = registry?.getDrops(expectedType, location.requiredTier, {
      profession,
      locationId: location.id,
      toolTier,
    }) ?? [];

    let materialId: string;
    let yieldAmount: number;
    let selectedDrop: ContentDropEntry | null = null;

    if (contentDrops.length > 0) {
      const rolledDrops = contentDrops.filter((drop) => Math.random() < drop.chance);
      const dropPool = rolledDrops.length > 0 ? rolledDrops : contentDrops;
      selectedDrop = pickWeightedDrop(dropPool);
      materialId = selectedDrop.itemId;
      yieldAmount = randomIntInclusive(selectedDrop.minQty, selectedDrop.maxQty);
    } else {
      yieldAmount = calculateYield(toolTier);
      materialId = getLocationMaterial(location);
    }

    const addResult = await itemMutationService.adjustItemQuantity(
      {
        actorId,
        targetId: userId,
        guildId,
        itemId: materialId,
        delta: yieldAmount,
        reason: `Gathered at ${location.name}`,
      },
      async () => true, // Internal operation
    );

    if (addResult.isErr()) {
      return ErrResult(
        new RpgError("UPDATE_FAILED", `Failed to add materials: ${addResult.error.message}`),
      );
    }

    // Step 10: Audit
    await economyAuditRepo.create({
      operationType: "craft", // Closest match for gathering
      actorId,
      targetId: userId,
      guildId,
      source: `rpg-${location.type}`,
      reason: `Gathered ${yieldAmount}x ${materialId} at ${location.name}`,
      itemData: {
        itemId: materialId,
        quantity: yieldAmount,
      },
      metadata: {
        correlationId,
        locationId: location.id,
        toolId: equippedItemId,
        toolInstanceId: instanceId,
        profession,
        toolBroken,
        remainingDurability,
        contentDropTableId: selectedDrop?.tableId,
        contentDropChance: selectedDrop?.chance,
        contentDropSource: selectedDrop
          ? `${selectedDrop.__source.file} ${selectedDrop.__source.jsonPath}`
          : undefined,
      },
    });

    return OkResult({
      userId,
      locationId: location.id,
      tier: location.requiredTier,
      toolId: equippedItemId,
      materialsGained: [{ id: materialId, quantity: yieldAmount }],
      remainingDurability,
      toolBroken,
      correlationId,
      timestamp: new Date(),
    });
  }

  async getEquippedTool(userId: UserId): Promise<EquippedToolInfo | null> {
    const profileResult = await rpgProfileRepo.findById(userId);
    if (profileResult.isErr() || !profileResult.unwrap()) {
      return null;
    }

    const equipped = profileResult.unwrap()!.loadout.weapon;
    if (!equipped) {
      return null;
    }

    let itemId: string;
    let instanceId = "legacy";
    let durability = 10; // Fallback

    if (typeof equipped === "string") {
      // Legacy support or fallback
      itemId = equipped;
    } else {
      itemId = equipped.itemId;
      instanceId = equipped.instanceId;
      durability = equipped.durability;
    }

    const toolKind = getToolKind({ id: itemId, tool: { toolKind: "pickaxe", tier: 1, maxDurability: 10 } } as any);

    // Check if it really is a tool
    if (!toolKind) return null;

    return {
      itemId,
      instanceId,
      tier: getToolTierFromItemId(itemId),
      toolKind: toolKind === "pickaxe" ? "pickaxe" : "axe",
      durability,
    };
  }
}

export const rpgGatheringService: RpgGatheringService = new RpgGatheringServiceImpl();
