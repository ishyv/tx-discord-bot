/**
 * RPG Profile Service.
 *
 * Purpose: Orchestrate RPG profile operations with economy integration.
 * Context: Service layer between commands and repositories.
 * Dependencies:
 * - RpgProfileRepo for profile metadata
 * - EconomyAccountRepo for account gating
 * - AuditRepo for audit logging
 *
 * Invariants:
 * - All public methods return Result<T, Error> (no exceptions).
 * - Account status (blocked/banned) gates RPG access.
 * - Profile creation is idempotent.
 * - All operations are audited.
 *
 * Gotchas:
 * - Blocked/banned accounts get generic error messages (no leak).
 * - ensureAndGate checks economy account status before allowing RPG operations.
 */

import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { UserId } from "@/db/types";
import { economyAccountRepo } from "@/modules/economy/account/repository";
import { economyAuditRepo } from "@/modules/economy/audit/repository";
import { rpgProfileRepo } from "./repository";
import {
  type RpgProfile,
  type ProfileEnsureResult,
  type ProfileView,
  type ProfileViewOptions,
  type EquipInput,
  type EquipResult,
  RpgError,
  type EquipmentSlot,
} from "./types";
import type { Loadout } from "@/db/schemas/rpg-profile";
import { calcStats, clampHp, type ItemStatsResolver } from "../stats/calculator";
import { getItemDefinition } from "@/modules/inventory/items";

/** Check if account can access RPG features. */
function canAccessRpg(status: string): boolean {
  return status === "ok";
}

/** Gate check result for consistent error handling. */
function checkGate(status: string): Result<void, RpgError> {
  if (canAccessRpg(status)) {
    return OkResult(undefined);
  }
  return ErrResult(
    new RpgError(
      status === "banned" ? "ACCOUNT_BANNED" : "ACCOUNT_BLOCKED",
      "Account access denied",
    ),
  );
}

/** Default item resolver using inventory definitions. */
function defaultItemResolver(itemId: string): { atk?: number; def?: number; hp?: number } | null {
  const def = getItemDefinition(itemId);
  if (!def) return null;
  return {
    atk: def.stats?.atk,
    def: def.stats?.def,
    hp: def.stats?.hp,
  };
}

export interface RpgProfileService {
  /**
   * Get or create RPG profile. Returns profile + isNew flag.
   * Safe to call repeatedly (idempotent).
   * Does NOT check economy account status.
   */
  ensureProfile(userId: UserId): Promise<Result<ProfileEnsureResult, Error>>;

  /**
   * Ensure profile AND check economy account gate.
   * Blocked/banned accounts cannot use RPG commands.
   */
  ensureAndGate(
    userId: UserId,
    guildId?: string,
  ): Promise<Result<ProfileEnsureResult, RpgError>>;

  /**
   * Get profile if it exists (does not create).
   */
  getProfile(userId: UserId): Promise<Result<RpgProfile | null, Error>>;

  /**
   * Check if user can use RPG (validates economy account status).
   */
  canUseRpg(userId: UserId): Promise<Result<{ allowed: boolean; reason?: string }, Error>>;

  /**
   * Get computed stats from equipment (ATK, DEF, MAX_HP).
   */
  getComputedStats(
    userId: UserId,
    itemResolver?: ItemStatsResolver,
  ): Promise<Result<{ atk: number; def: number; maxHp: number } | null, Error>>;

  /**
   * Build profile view.
   */
  getProfileView(
    userId: UserId,
    options?: ProfileViewOptions,
  ): Promise<Result<ProfileView | null, Error>>;

  /**
   * Equip/unequip an item to a slot.
   * Automatically clamps HP if max HP changes.
   */
  equip(input: EquipInput): Promise<Result<EquipResult, RpgError>>;

  /**
   * Unequip all items.
   * Automatically clamps HP after unequipping.
   */
  unequipAll(
    userId: UserId,
    actorId: UserId,
    guildId?: string,
  ): Promise<Result<EquipResult[], RpgError>>;
}

class RpgProfileServiceImpl implements RpgProfileService {
  async ensureProfile(userId: UserId): Promise<Result<ProfileEnsureResult, Error>> {
    return rpgProfileRepo.ensure(userId);
  }

  async ensureAndGate(
    userId: UserId,
    guildId?: string,
  ): Promise<Result<ProfileEnsureResult, RpgError>> {
    const correlationId = this.generateCorrelationId();

    // Step 1: Check economy account status
    const accountResult = await economyAccountRepo.findById(userId);
    if (accountResult.isErr()) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "Could not verify account status"));
    }

    const account = accountResult.unwrap();
    if (!account) {
      // Auto-create economy account if missing (lazy initialization)
      const ensureAccount = await economyAccountRepo.ensure(userId);
      if (ensureAccount.isErr()) {
        return ErrResult(new RpgError("PROFILE_NOT_FOUND", "Could not create account"));
      }
      // Re-check gate with new account
      const gateCheck = checkGate(ensureAccount.unwrap().account.status);
      if (gateCheck.isErr()) {
        return ErrResult(gateCheck.error);
      }
    } else {
      // Check gate on existing account
      const gateCheck = checkGate(account.status);
      if (gateCheck.isErr()) {
        return ErrResult(gateCheck.error);
      }
    }

    // Step 2: Ensure RPG profile
    const profileResult = await rpgProfileRepo.ensure(userId);
    if (profileResult.isErr()) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "Failed to create RPG profile"));
    }

    const { profile, isNew } = profileResult.unwrap();

    // Step 3: Audit if newly created
    if (isNew) {
      const auditResult = await economyAuditRepo.create({
        operationType: "xp_grant", // Using closest available type
        actorId: userId,
        targetId: userId,
        guildId,
        source: "rpg-profile-create",
        reason: "Auto-created RPG profile on first use",
        metadata: {
          correlationId,
          profileCreatedAt: profile.createdAt,
        },
      });

      if (auditResult.isErr()) {
        console.error("[RpgProfileService] Failed to create audit entry:", auditResult.error);
      }
    }

    return OkResult({ profile, isNew });
  }

  async getProfile(userId: UserId): Promise<Result<RpgProfile | null, Error>> {
    return rpgProfileRepo.findById(userId);
  }

  async getComputedStats(
    userId: UserId,
    itemResolver?: ItemStatsResolver,
  ): Promise<Result<{ atk: number; def: number; maxHp: number } | null, Error>> {
    const profileResult = await rpgProfileRepo.findById(userId);
    if (profileResult.isErr()) {
      return ErrResult(profileResult.error);
    }

    const profile = profileResult.unwrap();
    if (!profile) {
      return OkResult(null);
    }

    const resolver = itemResolver ?? defaultItemResolver;
    const stats = calcStats(profile.loadout, resolver);
    return OkResult(stats);
  }

  async canUseRpg(userId: UserId): Promise<Result<{ allowed: boolean; reason?: string }, Error>> {
    const accountResult = await economyAccountRepo.findById(userId);
    if (accountResult.isErr()) {
      return ErrResult(accountResult.error);
    }

    const account = accountResult.unwrap();
    if (!account) {
      return OkResult({ allowed: true }); // No account = new user, allow
    }

    if (account.status === "banned") {
      return OkResult({ allowed: false, reason: "Account is banned" });
    }
    if (account.status === "blocked") {
      return OkResult({ allowed: false, reason: "Account is blocked" });
    }

    return OkResult({ allowed: true });
  }

  async getProfileView(
    userId: UserId,
    options?: ProfileViewOptions,
  ): Promise<Result<ProfileView | null, Error>> {
    const profileResult = await rpgProfileRepo.findById(userId);
    if (profileResult.isErr()) {
      return ErrResult(profileResult.error);
    }

    const profile = profileResult.unwrap();
    if (!profile) {
      return OkResult(null);
    }

    // Calculate max HP
    let maxHp = options?.defaultMaxHp ?? 100;
    if (options?.resolveItem) {
      for (const [, value] of Object.entries(profile.loadout)) {
        if (value) {
          const itemId = typeof value === "string" ? value : value.itemId;
          const item = options.resolveItem(itemId);
          if (item?.hp) {
            maxHp += item.hp;
          }
        }
      }
    }

    const totalFights = profile.wins + profile.losses;
    const winRate = totalFights > 0 ? Math.round((profile.wins / totalFights) * 100) : 0;

    const view: ProfileView = {
      userId: profile.userId,
      loadout: profile.loadout,
      hpCurrent: profile.hpCurrent,
      maxHp,
      wins: profile.wins,
      losses: profile.losses,
      winRate,
      isFighting: profile.isFighting,
      activeFightId: profile.activeFightId,
      totalFights,
    };

    return OkResult(view);
  }

  async equip(input: EquipInput): Promise<Result<EquipResult, RpgError>> {
    const correlationId = input.correlationId ?? this.generateCorrelationId();

    // Get profile
    const profileResult = await rpgProfileRepo.findById(input.userId);
    if (profileResult.isErr() || !profileResult.unwrap()) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "RPG profile not found"));
    }

    const profile = profileResult.unwrap()!;

    // Check not in combat
    if (profile.isFighting) {
      return ErrResult(new RpgError("IN_COMBAT", "Cannot change equipment while in combat"));
    }

    // Calculate current and new max HP for clamping
    const currentStats = calcStats(profile.loadout, defaultItemResolver);
    const rawPrevious = profile.loadout[input.slot];
    const previousItemId = typeof rawPrevious === "string" || rawPrevious === null ? rawPrevious : rawPrevious.itemId;
    const newLoadout: Loadout = {
      ...profile.loadout,
      [input.slot]: input.itemId,
    };
    const newStats = calcStats(newLoadout, defaultItemResolver);

    // Clamp HP to new max if max HP decreased
    const newHpCurrent = clampHp(profile.hpCurrent, newStats.maxHp);

    const updateResult = await rpgProfileRepo.updateLoadout(
      input.userId,
      newLoadout,
      newHpCurrent,
    );
    if (updateResult.isErr()) {
      return ErrResult(new RpgError("UPDATE_FAILED", "Failed to update loadout"));
    }

    const updatedProfile = updateResult.unwrap();

    // Audit
    await economyAuditRepo.create({
      operationType: input.itemId ? "item_equip" : "item_unequip",
      actorId: input.actorId,
      targetId: input.userId,
      guildId: input.guildId,
      source: "rpg-equipment",
      reason: `${input.itemId ? "Equip" : "Unequip"} ${input.slot}`,
      itemData: {
        itemId: input.itemId ?? previousItemId ?? "unknown",
        quantity: 1,
      },
      metadata: {
        correlationId,
        slot: input.slot,
        previousItemId,
        newItemId: input.itemId,
        hpDelta: newHpCurrent - profile.hpCurrent,
        maxHpDelta: newStats.maxHp - currentStats.maxHp,
      },
    });

    return OkResult({
      userId: input.userId,
      slot: input.slot,
      previousItemId,
      newItemId: input.itemId,
      hpCurrent: updatedProfile.hpCurrent,
      correlationId,
      timestamp: new Date(),
    });
  }

  async unequipAll(
    userId: UserId,
    actorId: UserId,
    guildId?: string,
  ): Promise<Result<EquipResult[], RpgError>> {
    const profileResult = await rpgProfileRepo.findById(userId);
    if (profileResult.isErr() || !profileResult.unwrap()) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "Profile not found"));
    }

    const profile = profileResult.unwrap()!;
    const results: EquipResult[] = [];

    const slots: EquipmentSlot[] = [
      "weapon",
      "shield",
      "helmet",
      "chest",
      "pants",
      "boots",
      "ring",
      "necklace",
    ];

    for (const slot of slots) {
      if (profile.loadout[slot] !== null) {
        const result = await this.equip({
          userId,
          actorId,
          guildId,
          slot,
          itemId: null,
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
    return `rpg_profile_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

/** Singleton instance. */
export const rpgProfileService: RpgProfileService = new RpgProfileServiceImpl();
