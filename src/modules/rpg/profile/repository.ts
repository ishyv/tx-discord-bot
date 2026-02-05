/**
 * RPG Profile Repository.
 *
 * Purpose: Handle persistence and lifecycle of RPG profile metadata.
 * Context: Wraps UserStore to provide profile-specific operations with
 * lazy initialization, loadout management, and data repair.
 *
 * Dependencies:
 * - UserStore for persistence
 * - RpgProfileSchema for validation/repair
 * - runUserTransition for optimistic concurrency
 *
 * Invariants:
 * - Profiles are lazy-initialized on first ensure() call.
 * - Corrupted data is auto-repaired with logging.
 * - Loadout changes use optimistic concurrency.
 * - All operations return Result<T, Error> (no exceptions).
 *
 * Gotchas:
 * - Repair operations increment version to signal data was touched.
 */

import { UserStore } from "@/db/repositories/users";
import type { User } from "@/db/schemas/user";
import {
  RpgProfileSchema,
  type RpgProfileData,
  type Loadout,
  repairRpgProfile,
  detectCorruption,
} from "@/db/schemas/rpg-profile";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { runUserTransition } from "@/db/user-transition";
import type { UserId } from "@/db/types";
import {
  type RpgProfile,
  type ProfileEnsureResult,
} from "./types";

/** Convert DB data to domain model. */
function toDomain(userId: string, data: RpgProfileData): RpgProfile {
  return {
    userId,
    loadout: data.loadout,
    hpCurrent: data.hpCurrent,
    wins: data.wins,
    losses: data.losses,
    isFighting: data.isFighting,
    activeFightId: data.activeFightId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    version: data.version,
  };
}

/** Build DB data from domain model. */
function toData(profile: RpgProfile): RpgProfileData {
  return {
    loadout: profile.loadout,
    hpCurrent: profile.hpCurrent,
    wins: profile.wins,
    losses: profile.losses,
    isFighting: profile.isFighting,
    activeFightId: profile.activeFightId,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    version: profile.version,
  };
}

/**
 * Extract RPG profile from user document with repair capability.
 * Returns null if field is missing (not yet initialized).
 * Repairs corrupted data automatically and logs the issue.
 */
function extractProfile(
  user: User,
  userId: string,
  shouldRepair: boolean,
): { profile: RpgProfile | null; wasRepaired: boolean } {
  const raw = (user as Record<string, unknown>).rpgProfile;

  if (!raw) {
    return { profile: null, wasRepaired: false };
  }

  // Check for corruption
  const corruption = detectCorruption(raw);
  if (corruption.length > 0) {
    console.warn(
      `[RpgProfileRepo] Detected corrupted data for user ${userId}, fields: ${corruption.join(", ")}`,
    );

    if (shouldRepair) {
      const repaired = repairRpgProfile(raw);
      console.info(`[RpgProfileRepo] Auto-repaired profile for user ${userId}`);
      return {
        profile: toDomain(userId, repaired),
        wasRepaired: true,
      };
    }
  }

  const parsed = RpgProfileSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(
      `[RpgProfileRepo] Failed to parse profile for user ${userId}, using defaults`,
    );
    const repaired = repairRpgProfile(raw);
    return {
      profile: toDomain(userId, repaired),
      wasRepaired: true,
    };
  }

  return {
    profile: toDomain(userId, parsed.data),
    wasRepaired: false,
  };
}

export interface RpgProfileRepo {
  /**
   * Find profile by user ID.
   * Returns null if user exists but has no RPG profile (not initialized).
   * Returns error if user lookup fails.
   */
  findById(userId: UserId): Promise<Result<RpgProfile | null, Error>>;

  /**
   * Ensure profile exists, creating lazily if needed.
   * Returns the profile and whether it was newly created.
   */
  ensure(userId: UserId): Promise<Result<ProfileEnsureResult, Error>>;

  /**
   * Update loadout with optimistic concurrency.
   * Optionally clamps HP to new max HP if provided.
   */
  updateLoadout(
    userId: UserId,
    loadout: Loadout,
    hpCurrent?: number,
  ): Promise<Result<RpgProfile, Error>>;

  /**
   * Update combat state (isFighting, activeFightId, hpCurrent).
   * Uses expectedIsFighting for CAS.
   */
  updateCombatState(
    userId: UserId,
    isFighting: boolean,
    activeFightId: string | null,
    hpCurrent: number,
    expectedIsFighting: boolean,
  ): Promise<Result<RpgProfile | null, Error>>;

  /**
   * Update combat record (wins/losses) and reset combat state.
   * Optionally clamps HP to max HP if provided.
   */
  completeCombat(
    userId: UserId,
    wins: number,
    losses: number,
    hpCurrent: number,
    maxHp?: number,
  ): Promise<Result<RpgProfile, Error>>;

  /**
   * Repair corrupted profile data explicitly.
   * Returns info about what was repaired.
   */
  repair(userId: UserId): Promise<Result<RpgProfile, Error>>;
}

class RpgProfileRepoImpl implements RpgProfileRepo {
  async findById(userId: UserId): Promise<Result<RpgProfile | null, Error>> {
    const userResult = await UserStore.get(userId);
    if (userResult.isErr()) {
      return ErrResult(userResult.error);
    }

    const user = userResult.unwrap();
    if (!user) {
      return OkResult(null);
    }

    // NOTE: Do NOT repair here. findById is a pure read operation.
    // Repair happens in ensure() or repair() only.
    const { profile } = extractProfile(user, userId, false);
    return OkResult(profile);
  }

  async ensure(userId: UserId): Promise<Result<ProfileEnsureResult, Error>> {
    // First ensure user exists
    const userResult = await UserStore.ensure(userId);
    if (userResult.isErr()) {
      return ErrResult(userResult.error);
    }

    const user = userResult.unwrap();
    const { profile, wasRepaired } = extractProfile(user, userId, true);

    // If profile exists and wasn't corrupted, return it
    if (profile && !wasRepaired) {
      return OkResult({ profile, isNew: false });
    }

    // If profile exists but was repaired, persist the repair
    if (profile && wasRepaired) {
      const repairResult = await this.persistRepair(userId, profile);
      if (repairResult.isErr()) {
        return ErrResult(repairResult.error);
      }
      return OkResult({ profile: repairResult.unwrap(), isNew: false });
    }

    // Need to create new profile
    const now = new Date();
    const newProfile: RpgProfile = {
      userId,
      loadout: {
        weapon: null,
        shield: null,
        helmet: null,
        chest: null,
        pants: null,
        boots: null,
        ring: null,
        necklace: null,
      },
      hpCurrent: 100,
      wins: 0,
      losses: 0,
      isFighting: false,
      activeFightId: null,
      createdAt: now,
      updatedAt: now,
      version: 0,
    };

    // Use atomic transition to initialize
    const result = await runUserTransition<RpgProfile | null, RpgProfileData, ProfileEnsureResult>(
      userId,
      {
        getSnapshot: (u) => extractProfile(u, userId, false).profile,
        computeNext: (current): Result<RpgProfileData, Error> => {
          if (current) {
            // Someone else created it - will be handled in project
            return ErrResult(new Error("PROFILE_EXISTS"));
          }
          return OkResult(toData(newProfile));
        },
        commit: (id, _expected, next) =>
          UserStore.patch(id, { rpgProfile: next } as any),
        project: (updatedUser, _next): ProfileEnsureResult => {
          const data = (updatedUser as Record<string, unknown>).rpgProfile as RpgProfileData;
          return { profile: toDomain(userId, data), isNew: true };
        },
        conflictError: "RPG_PROFILE_INIT_CONFLICT",
      },
    );

    if (result.isErr()) {
      // Handle race condition: if conflict, someone else created it. Re-read and return existing.
      const error = result.error;
      if (error instanceof Error && error.message === "RPG_PROFILE_INIT_CONFLICT") {
        const freshResult = await this.findById(userId);
        if (freshResult.isErr()) return ErrResult(freshResult.error);
        const existing = freshResult.unwrap();
        if (existing) {
          return OkResult({ profile: existing, isNew: false });
        }
      }
      return ErrResult(result.error);
    }

    return OkResult(result.unwrap());
  }

  async updateLoadout(
    userId: UserId,
    loadout: Loadout,
    hpCurrent?: number,
  ): Promise<Result<RpgProfile, Error>> {
    return runUserTransition<RpgProfile | null, RpgProfile, RpgProfile>(userId, {
      getSnapshot: (u) => extractProfile(u, userId, false).profile,
      computeNext: (current): Result<RpgProfile, Error> => {
        if (!current) {
          return ErrResult(new Error("PROFILE_NOT_FOUND"));
        }
        const next: RpgProfile = {
          ...current,
          loadout,
          hpCurrent: hpCurrent ?? current.hpCurrent,
          updatedAt: new Date(),
          version: current.version + 1,
        };
        return OkResult(next);
      },
      commit: (id, _expected, next) =>
        UserStore.patch(id, { rpgProfile: toData(next) } as any),
      project: (updatedUser) => {
        const data = (updatedUser as Record<string, unknown>).rpgProfile as RpgProfileData;
        return toDomain(userId, data);
      },
      conflictError: "RPG_LOADOUT_CONFLICT",
    });
  }

  async updateCombatState(
    userId: UserId,
    isFighting: boolean,
    activeFightId: string | null,
    hpCurrent: number,
    expectedIsFighting: boolean,
  ): Promise<Result<RpgProfile | null, Error>> {
    return runUserTransition<RpgProfile | null, RpgProfile | null, RpgProfile | null>(
      userId,
      {
        getSnapshot: (u) => extractProfile(u, userId, false).profile,
        computeNext: (current): Result<RpgProfile | null, Error> => {
          if (!current) {
            return ErrResult(new Error("PROFILE_NOT_FOUND"));
          }
          // Check expected fighting state (CAS)
          if (current.isFighting !== expectedIsFighting) {
            return OkResult(null); // Conflict, return null to trigger retry
          }
          const next: RpgProfile = {
            ...current,
            isFighting,
            activeFightId,
            hpCurrent,
            updatedAt: new Date(),
            version: current.version + 1,
          };
          return OkResult(next);
        },
        commit: (id, _expected, next) => {
          if (!next) return Promise.resolve(OkResult(null as any));
          return UserStore.patch(id, { rpgProfile: toData(next) } as any);
        },
        project: (updatedUser) => {
          const data = (updatedUser as Record<string, unknown>).rpgProfile as RpgProfileData;
          if (!data) return null;
          return toDomain(userId, data);
        },
        conflictError: "RPG_COMBAT_STATE_CONFLICT",
      },
    );
  }

  async completeCombat(
    userId: UserId,
    wins: number,
    losses: number,
    hpCurrent: number,
    maxHp?: number,
  ): Promise<Result<RpgProfile, Error>> {
    return runUserTransition<RpgProfile | null, RpgProfile, RpgProfile>(userId, {
      getSnapshot: (u) => extractProfile(u, userId, false).profile,
      computeNext: (current): Result<RpgProfile, Error> => {
        if (!current) {
          return ErrResult(new Error("PROFILE_NOT_FOUND"));
        }
        // Clamp HP to max if provided
        const clampedHp = maxHp !== undefined
          ? Math.max(0, Math.min(maxHp, Math.floor(hpCurrent)))
          : hpCurrent;
        const next: RpgProfile = {
          ...current,
          wins,
          losses,
          hpCurrent: clampedHp,
          isFighting: false,
          activeFightId: null,
          updatedAt: new Date(),
          version: current.version + 1,
        };
        return OkResult(next);
      },
      commit: (id, _expected, next) =>
        UserStore.patch(id, { rpgProfile: toData(next) } as any),
      project: (updatedUser) => {
        const data = (updatedUser as Record<string, unknown>).rpgProfile as RpgProfileData;
        return toDomain(userId, data);
      },
      conflictError: "RPG_COMPLETE_COMBAT_CONFLICT",
    });
  }

  async repair(userId: UserId): Promise<Result<RpgProfile, Error>> {
    const userResult = await UserStore.get(userId);
    if (userResult.isErr()) {
      return ErrResult(userResult.error);
    }

    const user = userResult.unwrap();
    if (!user) {
      return ErrResult(new Error("USER_NOT_FOUND"));
    }

    const raw = (user as Record<string, unknown>).rpgProfile;
    const corruption = detectCorruption(raw);

    if (corruption.length === 0) {
      // No corruption detected
      const { profile } = extractProfile(user, userId, false);
      if (profile) {
        return OkResult(profile);
      }
      // Create default if no profile exists
      const defaultData = repairRpgProfile(null);
      return OkResult(toDomain(userId, defaultData));
    }

    const repaired = repairRpgProfile(raw);
    const profile = toDomain(userId, repaired);

    // Persist the repair with version increment
    const persistResult = await this.persistRepair(userId, profile);
    if (persistResult.isErr()) {
      return ErrResult(persistResult.error);
    }

    return OkResult(persistResult.unwrap());
  }

  private async persistRepair(
    userId: UserId,
    profile: RpgProfile,
  ): Promise<Result<RpgProfile, Error>> {
    // Increment version to signal data was touched
    const data = toData({
      ...profile,
      version: profile.version + 1,
      updatedAt: new Date(),
    });

    const result = await UserStore.patch(userId, { rpgProfile: data } as any);
    if (result.isErr()) {
      return ErrResult(result.error);
    }

    const profileData = (result.unwrap() as Record<string, unknown>).rpgProfile;
    if (!profileData) {
      return ErrResult(new Error("Repair failed: rpgProfile still missing after patch"));
    }
    return OkResult(toDomain(userId, profileData as RpgProfileData));
  }
}

/** Singleton instance. */
export const rpgProfileRepo: RpgProfileRepo = new RpgProfileRepoImpl();
