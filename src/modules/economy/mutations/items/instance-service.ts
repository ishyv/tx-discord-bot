/**
 * Item Instance Mutation Service.
 *
 * Purpose: Handle instance-based items (tools/weapons/armor) with durability.
 * Context: Creates instances with durability instead of quantity increments.
 * Dependencies: Item definitions, inventory capacity, UserStore.
 *
 * Invariants:
 * - Instance-based items always create new instances (never increment quantity).
 * - Removing instance-based items pops from the stack (FIFO).
 * - Durability decrements are tracked per-instance.
 */

import { UserStore } from "@/db/repositories/users";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { UserId } from "@/db/types";
import type { ItemId } from "@/modules/inventory/definitions";
import type { ModernInventory } from "@/modules/inventory/inventory";
import type { ItemInstance, InstanceId } from "@/modules/inventory/instances";
import {
  normalizeModernInventory,
  addInstance,
  popInstances,
  removeInstanceById,
  useInstance,
  createAndAddInstances,
  getModernItemQuantity,
} from "@/modules/inventory/inventory";
import { isInstanceBased, createInstance } from "@/modules/inventory/instances";
import {
  calculateModernCapacity,
  canAddInstances,
  type CapacityLimits,
} from "@/modules/inventory/capacity";
import { economyAuditRepo } from "../../audit/repository";
import { perkService } from "../../perks/service";
import { ItemInstanceError } from "./types";

export interface GrantInstanceInput {
  actorId: UserId;
  targetId: UserId;
  guildId?: string;
  itemId: ItemId;
  durability?: number;
  reason?: string;
  correlationId?: string;
}

export interface GrantInstanceResult {
  targetId: UserId;
  itemId: ItemId;
  instance: ItemInstance;
  capacity: {
    currentWeight: number;
    maxWeight: number;
    currentSlots: number;
    maxSlots: number;
  };
  timestamp: Date;
}

export interface GrantInstancesInput extends GrantInstanceInput {
  count: number;
}

export interface GrantInstancesResult {
  targetId: UserId;
  itemId: ItemId;
  instances: ItemInstance[];
  capacity: {
    currentWeight: number;
    maxWeight: number;
    currentSlots: number;
    maxSlots: number;
  };
  timestamp: Date;
}

export interface RemoveInstanceInput {
  actorId: UserId;
  targetId: UserId;
  guildId?: string;
  itemId: ItemId;
  instanceId?: InstanceId; // If not provided, pops first available
  reason?: string;
  correlationId?: string;
}

export interface RemoveInstanceResult {
  targetId: UserId;
  itemId: ItemId;
  removed: ItemInstance | null;
  timestamp: Date;
}

export interface RemoveInstancesInput {
  actorId: UserId;
  targetId: UserId;
  guildId?: string;
  itemId: ItemId;
  count: number;
  reason?: string;
  correlationId?: string;
}

export interface RemoveInstancesResult {
  targetId: UserId;
  itemId: ItemId;
  removed: ItemInstance[];
  timestamp: Date;
}

export interface UseInstanceInput {
  userId: UserId;
  itemId: ItemId;
  instanceId: string;
  damage?: number;
  guildId?: string;
  reason?: string;
  correlationId?: string;
}

export interface UseInstanceResult {
  userId: UserId;
  itemId: ItemId;
  instanceId: string;
  broken: boolean;
  remainingDurability: number;
  timestamp: Date;
}

export interface ItemInstanceService {
  /**
   * Grant a single instance to a user.
   */
  grantInstance(
    input: GrantInstanceInput,
  ): Promise<Result<GrantInstanceResult, ItemInstanceError>>;

  /**
   * Grant multiple instances to a user.
   */
  grantInstances(
    input: GrantInstancesInput,
  ): Promise<Result<GrantInstancesResult, ItemInstanceError>>;

  /**
   * Remove a specific instance or pop the first available.
   */
  removeInstance(
    input: RemoveInstanceInput,
  ): Promise<Result<RemoveInstanceResult, ItemInstanceError>>;

  /**
   * Remove multiple instances (pops from stack).
   */
  removeInstances(
    input: RemoveInstancesInput,
  ): Promise<Result<RemoveInstancesResult, ItemInstanceError>>;

  /**
   * Use an instance (decrement durability).
   * Returns broken=true if item breaks.
   */
  useInstance(
    input: UseInstanceInput,
  ): Promise<Result<UseInstanceResult, ItemInstanceError>>;
}

/** Get capacity limits for user. */
async function getCapacityLimits(
  guildId: string | undefined,
  userId: UserId,
): Promise<CapacityLimits> {
  if (!guildId) {
    return { maxWeight: 200, maxSlots: 20 };
  }
  const result = await perkService.getCapacityLimits(guildId, userId);
  return result.isOk() ? result.unwrap() : { maxWeight: 200, maxSlots: 20 };
}

class ItemInstanceServiceImpl implements ItemInstanceService {
  async grantInstance(
    input: GrantInstanceInput,
  ): Promise<Result<GrantInstanceResult, ItemInstanceError>> {
    const correlationId = input.correlationId ?? this.generateCorrelationId();

    // Validate item is instance-based
    if (!isInstanceBased(input.itemId)) {
      return ErrResult(
        new ItemInstanceError(
          "NOT_INSTANCE_BASED",
          `Item ${input.itemId} is not instance-based (use adjustItemQuantity instead)`,
        ),
      );
    }

    // Get user and inventory
    const userResult = await UserStore.get(input.targetId);
    if (userResult.isErr() || !userResult.unwrap()) {
      return ErrResult(
        new ItemInstanceError("TARGET_NOT_FOUND", "User not found"),
      );
    }

    const inventory = normalizeModernInventory(userResult.unwrap()!.inventory);
    const limits = await getCapacityLimits(input.guildId, input.targetId);

    // Check capacity
    const capacityCheck = canAddInstances(inventory, input.itemId, 1, limits);
    if (!capacityCheck.allowed) {
      return ErrResult(
        new ItemInstanceError("CAPACITY_EXCEEDED", capacityCheck.reason!),
      );
    }

    // Create instance
    const instance = createInstance(input.itemId, input.durability);
    const newInventory = addInstance(inventory, instance);

    // Save to database
    const patchResult = await UserStore.patch(input.targetId, {
      inventory: newInventory,
    } as any);

    if (patchResult.isErr()) {
      return ErrResult(
        new ItemInstanceError("UPDATE_FAILED", "Failed to save inventory"),
      );
    }

    // Get updated capacity
    const capacity = calculateModernCapacity(newInventory, { limits });

    // Audit
    await economyAuditRepo.create({
      operationType: "item_grant",
      actorId: input.actorId,
      targetId: input.targetId,
      guildId: input.guildId,
      source: "instance-grant",
      reason: input.reason ?? `Grant instance of ${input.itemId}`,
      itemData: {
        itemId: input.itemId,
        instanceId: instance.instanceId,
        durability: instance.durability,
      },
      metadata: {
        correlationId,
        instanceId: instance.instanceId,
      },
    });

    return OkResult({
      targetId: input.targetId,
      itemId: input.itemId,
      instance,
      capacity: {
        currentWeight: capacity.currentWeight,
        maxWeight: capacity.maxWeight,
        currentSlots: capacity.currentSlots,
        maxSlots: capacity.maxSlots,
      },
      timestamp: new Date(),
    });
  }

  async grantInstances(
    input: GrantInstancesInput,
  ): Promise<Result<GrantInstancesResult, ItemInstanceError>> {
    const correlationId = input.correlationId ?? this.generateCorrelationId();

    if (!isInstanceBased(input.itemId)) {
      return ErrResult(
        new ItemInstanceError(
          "NOT_INSTANCE_BASED",
          `Item ${input.itemId} is not instance-based`,
        ),
      );
    }

    if (input.count <= 0) {
      return ErrResult(
        new ItemInstanceError("INVALID_QUANTITY", "Count must be positive"),
      );
    }

    const userResult = await UserStore.get(input.targetId);
    if (userResult.isErr() || !userResult.unwrap()) {
      return ErrResult(
        new ItemInstanceError("TARGET_NOT_FOUND", "User not found"),
      );
    }

    const inventory = normalizeModernInventory(userResult.unwrap()!.inventory);
    const limits = await getCapacityLimits(input.guildId, input.targetId);

    // Check capacity for all instances
    const capacityCheck = canAddInstances(
      inventory,
      input.itemId,
      input.count,
      limits,
    );
    if (!capacityCheck.allowed) {
      return ErrResult(
        new ItemInstanceError("CAPACITY_EXCEEDED", capacityCheck.reason!),
      );
    }

    // Create and add instances
    const { inventory: newInventory, created } = createAndAddInstances(
      inventory,
      input.itemId,
      input.count,
      input.durability,
    );

    const patchResult = await UserStore.patch(input.targetId, {
      inventory: newInventory,
    } as any);

    if (patchResult.isErr()) {
      return ErrResult(
        new ItemInstanceError("UPDATE_FAILED", "Failed to save inventory"),
      );
    }

    const capacity = calculateModernCapacity(newInventory, { limits });

    // Audit
    await economyAuditRepo.create({
      operationType: "item_grant",
      actorId: input.actorId,
      targetId: input.targetId,
      guildId: input.guildId,
      source: "instance-grant-batch",
      reason: input.reason ?? `Grant ${input.count} instances of ${input.itemId}`,
      itemData: {
        itemId: input.itemId,
        quantity: input.count,
      },
      metadata: {
        correlationId,
        instanceIds: created.map((i) => i.instanceId),
      },
    });

    return OkResult({
      targetId: input.targetId,
      itemId: input.itemId,
      instances: created,
      capacity: {
        currentWeight: capacity.currentWeight,
        maxWeight: capacity.maxWeight,
        currentSlots: capacity.currentSlots,
        maxSlots: capacity.maxSlots,
      },
      timestamp: new Date(),
    });
  }

  async removeInstance(
    input: RemoveInstanceInput,
  ): Promise<Result<RemoveInstanceResult, ItemInstanceError>> {
    const userResult = await UserStore.get(input.targetId);
    if (userResult.isErr() || !userResult.unwrap()) {
      return ErrResult(
        new ItemInstanceError("TARGET_NOT_FOUND", "User not found"),
      );
    }

    const inventory = normalizeModernInventory(userResult.unwrap()!.inventory);
    const entry = inventory[input.itemId];

    if (entry?.type !== "instances" || entry.instances.length === 0) {
      return ErrResult(
        new ItemInstanceError("ITEM_NOT_FOUND", "No instances found"),
      );
    }

    let removed: ItemInstance | null;
    let newInventory: ModernInventory;

    if (input.instanceId) {
      // Remove specific instance
      const result = removeInstanceById(
        inventory,
        input.itemId,
        input.instanceId,
      );
      newInventory = result.inventory;
      removed = result.removed;
    } else {
      // Pop first instance
      const result = popInstances(inventory, input.itemId, 1);
      newInventory = result.inventory;
      removed = result.removed[0] ?? null;
    }

    if (!removed) {
      return ErrResult(
        new ItemInstanceError("ITEM_NOT_FOUND", "Instance not found"),
      );
    }

    const patchResult = await UserStore.patch(input.targetId, {
      inventory: newInventory,
    } as any);

    if (patchResult.isErr()) {
      return ErrResult(
        new ItemInstanceError("UPDATE_FAILED", "Failed to save inventory"),
      );
    }

    // Audit
    await economyAuditRepo.create({
      operationType: "item_remove",
      actorId: input.actorId,
      targetId: input.targetId,
      guildId: input.guildId,
      source: "instance-remove",
      reason: input.reason ?? `Remove instance of ${input.itemId}`,
      itemData: {
        itemId: input.itemId,
        instanceId: removed.instanceId,
        durability: removed.durability,
      },
      metadata: {
        correlationId: input.correlationId ?? this.generateCorrelationId(),
      },
    });

    return OkResult({
      targetId: input.targetId,
      itemId: input.itemId,
      removed,
      timestamp: new Date(),
    });
  }

  async removeInstances(
    input: RemoveInstancesInput,
  ): Promise<Result<RemoveInstancesResult, ItemInstanceError>> {
    if (input.count <= 0) {
      return ErrResult(
        new ItemInstanceError("INVALID_QUANTITY", "Count must be positive"),
      );
    }

    const userResult = await UserStore.get(input.targetId);
    if (userResult.isErr() || !userResult.unwrap()) {
      return ErrResult(
        new ItemInstanceError("TARGET_NOT_FOUND", "User not found"),
      );
    }

    const inventory = normalizeModernInventory(userResult.unwrap()!.inventory);
    const available = getModernItemQuantity(inventory, input.itemId);

    if (available < input.count) {
      return ErrResult(
        new ItemInstanceError(
          "INSUFFICIENT_QUANTITY",
          `Only ${available} instances available`,
        ),
      );
    }

    const { inventory: newInventory, removed } = popInstances(
      inventory,
      input.itemId,
      input.count,
    );

    const patchResult = await UserStore.patch(input.targetId, {
      inventory: newInventory,
    } as any);

    if (patchResult.isErr()) {
      return ErrResult(
        new ItemInstanceError("UPDATE_FAILED", "Failed to save inventory"),
      );
    }

    // Audit
    await economyAuditRepo.create({
      operationType: "item_remove",
      actorId: input.actorId,
      targetId: input.targetId,
      guildId: input.guildId,
      source: "instance-remove-batch",
      reason: input.reason ?? `Remove ${input.count} instances of ${input.itemId}`,
      itemData: {
        itemId: input.itemId,
        quantity: input.count,
      },
      metadata: {
        correlationId: input.correlationId ?? this.generateCorrelationId(),
        instanceIds: removed.map((i) => i.instanceId),
      },
    });

    return OkResult({
      targetId: input.targetId,
      itemId: input.itemId,
      removed,
      timestamp: new Date(),
    });
  }

  async useInstance(
    input: UseInstanceInput,
  ): Promise<Result<UseInstanceResult, ItemInstanceError>> {
    const userResult = await UserStore.get(input.userId);
    if (userResult.isErr() || !userResult.unwrap()) {
      return ErrResult(
        new ItemInstanceError("TARGET_NOT_FOUND", "User not found"),
      );
    }

    const inventory = normalizeModernInventory(userResult.unwrap()!.inventory);
    const entry = inventory[input.itemId];

    if (entry?.type !== "instances") {
      return ErrResult(
        new ItemInstanceError("ITEM_NOT_FOUND", "No instances found"),
      );
    }

    const instance = entry.instances.find(
      (i) => i.instanceId === input.instanceId,
    );
    if (!instance) {
      return ErrResult(
        new ItemInstanceError("ITEM_NOT_FOUND", "Instance not found"),
      );
    }

    const damage = input.damage ?? 1;
    const { inventory: newInventory, broken, remainingDurability } = useInstance(
      inventory,
      input.itemId,
      input.instanceId,
      damage,
    );

    const patchResult = await UserStore.patch(input.userId, {
      inventory: newInventory,
    } as any);

    if (patchResult.isErr()) {
      return ErrResult(
        new ItemInstanceError("UPDATE_FAILED", "Failed to save inventory"),
      );
    }

    // Audit
    await economyAuditRepo.create({
      operationType: "item_use",
      actorId: input.userId,
      targetId: input.userId,
      guildId: input.guildId,
      source: "instance-use",
      reason:
        input.reason ??
        `Use instance ${input.instanceId} (damage: ${damage})`,
      itemData: {
        itemId: input.itemId,
        instanceId: input.instanceId,
        damage,
        broken,
        remainingDurability,
      },
      metadata: {
        correlationId: input.correlationId ?? this.generateCorrelationId(),
      },
    });

    return OkResult({
      userId: input.userId,
      itemId: input.itemId,
      instanceId: input.instanceId,
      broken,
      remainingDurability,
      timestamp: new Date(),
    });
  }

  private generateCorrelationId(): string {
    return `inst_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

export const itemInstanceService: ItemInstanceService =
  new ItemInstanceServiceImpl();
