/**
 * Achievements Repository.
 *
 * Purpose: Data access layer for user achievements, progress, and cosmetics.
 * Context: Used by achievement service. Follows repository pattern.
 * Dependencies: MongoDB, Zod schemas, Result pattern.
 */

import { getDb } from "@/db/mongo";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { UserId, GuildId } from "@/db/types";
import type {
  UnlockedAchievement,
  AchievementProgress,
  ProfileCosmetics,
  AchievementError,
  UserTitle,
  UserBadge,
  EquippedTitle,
} from "./types";
import { AchievementError as AchievementErrorClass } from "./types";

/** Collection names for achievement data. */
const COLLECTIONS = {
  unlocked: "achievements_unlocked",
  progress: "achievements_progress",
  cosmetics: "achievements_cosmetics",
} as const;

/** Build composite ID for unlocked achievement. */
function buildUnlockedId(
  userId: UserId,
  guildId: GuildId,
  achievementId: string,
): string {
  return `${userId}:${guildId}:${achievementId}`;
}

/** Build composite ID for achievement progress. */
function buildProgressId(
  userId: UserId,
  guildId: GuildId,
  achievementId: string,
): string {
  return `${userId}:${guildId}:${achievementId}`;
}

/** Build ID for profile cosmetics. */
function buildCosmeticsId(userId: UserId, guildId: GuildId): string {
  return `${userId}:${guildId}`;
}

/** Repository interface for achievements. */
export interface AchievementRepository {
  // -------------------------------------------------------------------------
  // Unlocked Achievements
  // -------------------------------------------------------------------------

  /** Check if user has unlocked an achievement. */
  hasUnlocked(
    userId: UserId,
    guildId: GuildId,
    achievementId: string,
  ): Promise<Result<boolean, AchievementError>>;

  /** Get all unlocked achievements for user. */
  getUnlocked(
    userId: UserId,
    guildId: GuildId,
  ): Promise<Result<UnlockedAchievement[], AchievementError>>;

  /** Record achievement unlock. */
  recordUnlock(
    userId: UserId,
    guildId: GuildId,
    achievementId: string,
    progress?: Record<string, unknown>,
  ): Promise<Result<UnlockedAchievement, AchievementError>>;

  /** Mark rewards as claimed. */
  markRewardsClaimed(
    userId: UserId,
    guildId: GuildId,
    achievementId: string,
  ): Promise<Result<UnlockedAchievement, AchievementError>>;

  // -------------------------------------------------------------------------
  // Progress Tracking
  // -------------------------------------------------------------------------

  /** Get or create progress for an achievement. */
  getOrCreateProgress(
    userId: UserId,
    guildId: GuildId,
    achievementId: string,
    target: number,
  ): Promise<Result<AchievementProgress, AchievementError>>;

  /** Update progress for an achievement. */
  updateProgress(
    userId: UserId,
    guildId: GuildId,
    achievementId: string,
    increment: number,
    target: number,
  ): Promise<Result<AchievementProgress, AchievementError>>;

  /** Set progress value directly. */
  setProgress(
    userId: UserId,
    guildId: GuildId,
    achievementId: string,
    value: number,
    target: number,
  ): Promise<Result<AchievementProgress, AchievementError>>;

  /** Get all progress for user. */
  getAllProgress(
    userId: UserId,
    guildId: GuildId,
  ): Promise<Result<AchievementProgress[], AchievementError>>;

  // -------------------------------------------------------------------------
  // Profile Cosmetics
  // -------------------------------------------------------------------------

  /** Get or create profile cosmetics. */
  getOrCreateCosmetics(
    userId: UserId,
    guildId: GuildId,
  ): Promise<Result<ProfileCosmetics, AchievementError>>;

  /** Update profile cosmetics. */
  updateCosmetics(
    userId: UserId,
    guildId: GuildId,
    updates: Partial<ProfileCosmetics>,
  ): Promise<Result<ProfileCosmetics, AchievementError>>;

  /** Add title to user's collection. */
  addTitle(
    userId: UserId,
    guildId: GuildId,
    title: UserTitle,
  ): Promise<Result<boolean, AchievementError>>;

  /** Add badge to user's collection. */
  addBadge(
    userId: UserId,
    guildId: GuildId,
    badge: UserBadge,
  ): Promise<Result<boolean, AchievementError>>;

  /** Equip a title. */
  equipTitle(
    userId: UserId,
    guildId: GuildId,
    titleId: string,
  ): Promise<Result<EquippedTitle, AchievementError>>;

  /** Unequip current title. */
  unequipTitle(
    userId: UserId,
    guildId: GuildId,
  ): Promise<Result<boolean, AchievementError>>;

  /** Set badge slot. */
  setBadgeSlot(
    userId: UserId,
    guildId: GuildId,
    slot: 1 | 2 | 3,
    badgeId: string | null,
  ): Promise<Result<boolean, AchievementError>>;
}

class AchievementRepositoryImpl implements AchievementRepository {
  // -------------------------------------------------------------------------
  // Unlocked Achievements
  // -------------------------------------------------------------------------

  async hasUnlocked(
    userId: UserId,
    guildId: GuildId,
    achievementId: string,
  ): Promise<Result<boolean, AchievementError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.unlocked);

      const doc = await collection.findOne({
        _id: buildUnlockedId(userId, guildId, achievementId),
      } as any);

      return OkResult(!!doc);
    } catch (error) {
      console.error("[AchievementRepository] hasUnlocked error:", error);
      return ErrResult(
        new AchievementErrorClass(
          "UPDATE_FAILED",
          "Failed to check achievement unlock status.",
        ),
      );
    }
  }

  async getUnlocked(
    userId: UserId,
    guildId: GuildId,
  ): Promise<Result<UnlockedAchievement[], AchievementError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.unlocked);

      const docs = await collection
        .find({ userId, guildId } as any)
        .sort({ unlockedAt: -1 })
        .toArray();

      const achievements: UnlockedAchievement[] = docs.map((doc) => ({
        _id: String(doc._id),
        userId: doc.userId,
        guildId: doc.guildId,
        achievementId: doc.achievementId,
        unlockedAt: doc.unlockedAt,
        rewardsClaimed: doc.rewardsClaimed ?? false,
        rewardsClaimedAt: doc.rewardsClaimedAt,
        unlockProgress: doc.unlockProgress,
      }));

      return OkResult(achievements);
    } catch (error) {
      console.error("[AchievementRepository] getUnlocked error:", error);
      return ErrResult(
        new AchievementErrorClass(
          "UPDATE_FAILED",
          "Failed to get unlocked achievements.",
        ),
      );
    }
  }

  async recordUnlock(
    userId: UserId,
    guildId: GuildId,
    achievementId: string,
    progress?: Record<string, unknown>,
  ): Promise<Result<UnlockedAchievement, AchievementError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.unlocked);

      const _id = buildUnlockedId(userId, guildId, achievementId);
      const now = new Date();

      // Use upsert with $setOnInsert to prevent overwriting existing unlocks
      const result = await collection.findOneAndUpdate(
        { _id } as any,
        {
          $setOnInsert: {
            _id,
            userId,
            guildId,
            achievementId,
            unlockedAt: now,
            rewardsClaimed: false,
            unlockProgress: progress,
          },
        } as any,
        { upsert: true, returnDocument: "after" },
      );

      if (!result) {
        return ErrResult(
          new AchievementErrorClass(
            "UPDATE_FAILED",
            "Failed to record achievement unlock.",
          ),
        );
      }

      const achievement: UnlockedAchievement = {
        _id: String(result._id),
        userId: result.userId,
        guildId: result.guildId,
        achievementId: result.achievementId,
        unlockedAt: result.unlockedAt,
        rewardsClaimed: result.rewardsClaimed ?? false,
        rewardsClaimedAt: result.rewardsClaimedAt,
        unlockProgress: result.unlockProgress,
      };

      return OkResult(achievement);
    } catch (error) {
      console.error("[AchievementRepository] recordUnlock error:", error);
      return ErrResult(
        new AchievementErrorClass(
          "UPDATE_FAILED",
          "Failed to record achievement unlock.",
        ),
      );
    }
  }

  async markRewardsClaimed(
    userId: UserId,
    guildId: GuildId,
    achievementId: string,
  ): Promise<Result<UnlockedAchievement, AchievementError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.unlocked);

      const _id = buildUnlockedId(userId, guildId, achievementId);
      const now = new Date();

      const result = await collection.findOneAndUpdate(
        { _id } as any,
        {
          $set: {
            rewardsClaimed: true,
            rewardsClaimedAt: now,
          },
        } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return ErrResult(
          new AchievementErrorClass(
            "ACHIEVEMENT_NOT_FOUND",
            "Achievement unlock not found.",
          ),
        );
      }

      const achievement: UnlockedAchievement = {
        _id: String(result._id),
        userId: result.userId,
        guildId: result.guildId,
        achievementId: result.achievementId,
        unlockedAt: result.unlockedAt,
        rewardsClaimed: result.rewardsClaimed ?? true,
        rewardsClaimedAt: result.rewardsClaimedAt ?? now,
        unlockProgress: result.unlockProgress,
      };

      return OkResult(achievement);
    } catch (error) {
      console.error("[AchievementRepository] markRewardsClaimed error:", error);
      return ErrResult(
        new AchievementErrorClass(
          "UPDATE_FAILED",
          "Failed to mark rewards as claimed.",
        ),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Progress Tracking
  // -------------------------------------------------------------------------

  async getOrCreateProgress(
    userId: UserId,
    guildId: GuildId,
    achievementId: string,
    target: number,
  ): Promise<Result<AchievementProgress, AchievementError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.progress);

      const _id = buildProgressId(userId, guildId, achievementId);
      const now = new Date();

      // Try to find existing
      const existing = await collection.findOne({ _id } as any);
      if (existing) {
        const progress: AchievementProgress = {
          _id,
          userId: existing.userId,
          guildId: existing.guildId,
          achievementId: existing.achievementId,
          progress: existing.progress ?? 0,
          target: existing.target ?? target,
          completed: existing.completed ?? false,
          updatedAt: existing.updatedAt ?? now,
        };
        return OkResult(progress);
      }

      // Create new
      const progress: AchievementProgress = {
        _id,
        userId,
        guildId,
        achievementId,
        progress: 0,
        target,
        completed: false,
        updatedAt: now,
      };

      await collection.insertOne({ ...progress } as any);
      return OkResult(progress);
    } catch (error) {
      console.error(
        "[AchievementRepository] getOrCreateProgress error:",
        error,
      );
      return ErrResult(
        new AchievementErrorClass(
          "UPDATE_FAILED",
          "Failed to get or create progress.",
        ),
      );
    }
  }

  async updateProgress(
    userId: UserId,
    guildId: GuildId,
    achievementId: string,
    increment: number,
    target: number,
  ): Promise<Result<AchievementProgress, AchievementError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.progress);

      const _id = buildProgressId(userId, guildId, achievementId);
      const now = new Date();

      const result = await collection.findOneAndUpdate(
        { _id } as any,
        {
          $inc: { progress: increment },
          $set: { updatedAt: now, target },
        } as any,
        { returnDocument: "after", upsert: true },
      );

      if (!result) {
        return ErrResult(
          new AchievementErrorClass(
            "UPDATE_FAILED",
            "Failed to update progress.",
          ),
        );
      }

      // Cap at target and mark completed
      const currentProgress = Math.min(result.progress ?? 0, target);
      const completed = currentProgress >= target;

      if (result.progress > target || !completed === !result.completed) {
        await collection.updateOne(
          { _id } as any,
          {
            $set: {
              progress: currentProgress,
              completed,
              userId,
              guildId,
              achievementId,
            },
          } as any,
        );
      }

      const progress: AchievementProgress = {
        _id,
        userId,
        guildId,
        achievementId,
        progress: currentProgress,
        target,
        completed,
        updatedAt: now,
      };

      return OkResult(progress);
    } catch (error) {
      console.error("[AchievementRepository] updateProgress error:", error);
      return ErrResult(
        new AchievementErrorClass(
          "UPDATE_FAILED",
          "Failed to update progress.",
        ),
      );
    }
  }

  async setProgress(
    userId: UserId,
    guildId: GuildId,
    achievementId: string,
    value: number,
    target: number,
  ): Promise<Result<AchievementProgress, AchievementError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.progress);

      const _id = buildProgressId(userId, guildId, achievementId);
      const now = new Date();

      const cappedValue = Math.min(value, target);
      const completed = cappedValue >= target;

      const result = await collection.findOneAndUpdate(
        { _id } as any,
        {
          $set: {
            progress: cappedValue,
            target,
            completed,
            updatedAt: now,
            userId,
            guildId,
            achievementId,
          },
        } as any,
        { returnDocument: "after", upsert: true },
      );

      if (!result) {
        return ErrResult(
          new AchievementErrorClass("UPDATE_FAILED", "Failed to set progress."),
        );
      }

      const progress: AchievementProgress = {
        _id,
        userId,
        guildId,
        achievementId,
        progress: cappedValue,
        target,
        completed,
        updatedAt: now,
      };

      return OkResult(progress);
    } catch (error) {
      console.error("[AchievementRepository] setProgress error:", error);
      return ErrResult(
        new AchievementErrorClass("UPDATE_FAILED", "Failed to set progress."),
      );
    }
  }

  async getAllProgress(
    userId: UserId,
    guildId: GuildId,
  ): Promise<Result<AchievementProgress[], AchievementError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.progress);

      const docs = await collection.find({ userId, guildId } as any).toArray();

      const progressList: AchievementProgress[] = docs.map((doc) => ({
        _id: String(doc._id),
        userId: doc.userId,
        guildId: doc.guildId,
        achievementId: doc.achievementId,
        progress: doc.progress ?? 0,
        target: doc.target ?? 0,
        completed: doc.completed ?? false,
        updatedAt: doc.updatedAt ?? new Date(),
      }));

      return OkResult(progressList);
    } catch (error) {
      console.error("[AchievementRepository] getAllProgress error:", error);
      return ErrResult(
        new AchievementErrorClass(
          "UPDATE_FAILED",
          "Failed to get all progress.",
        ),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Profile Cosmetics
  // -------------------------------------------------------------------------

  async getOrCreateCosmetics(
    userId: UserId,
    guildId: GuildId,
  ): Promise<Result<ProfileCosmetics, AchievementError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.cosmetics);

      const _id = buildCosmeticsId(userId, guildId);

      const doc = await collection.findOne({ _id } as any);
      if (doc) {
        const cosmetics: ProfileCosmetics = {
          equippedTitle: doc.equippedTitle,
          titles: doc.titles ?? [],
          badges: doc.badges ?? [],
          badgeSlots: doc.badgeSlots ?? [null, null, null],
          themeColor: doc.themeColor,
          banner: doc.banner,
        };
        return OkResult(cosmetics);
      }

      // Create new
      const cosmetics: ProfileCosmetics = {
        titles: [],
        badges: [],
        badgeSlots: [null, null, null],
      };

      await collection.insertOne({
        _id,
        userId,
        guildId,
        ...cosmetics,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      return OkResult(cosmetics);
    } catch (error) {
      console.error(
        "[AchievementRepository] getOrCreateCosmetics error:",
        error,
      );
      return ErrResult(
        new AchievementErrorClass(
          "UPDATE_FAILED",
          "Failed to get or create cosmetics.",
        ),
      );
    }
  }

  async updateCosmetics(
    userId: UserId,
    guildId: GuildId,
    updates: Partial<ProfileCosmetics>,
  ): Promise<Result<ProfileCosmetics, AchievementError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.cosmetics);

      const _id = buildCosmeticsId(userId, guildId);

      await collection.updateOne(
        { _id } as any,
        {
          $set: {
            ...updates,
            updatedAt: new Date(),
          },
        } as any,
        { upsert: true },
      );

      return this.getOrCreateCosmetics(userId, guildId);
    } catch (error) {
      console.error("[AchievementRepository] updateCosmetics error:", error);
      return ErrResult(
        new AchievementErrorClass(
          "UPDATE_FAILED",
          "Failed to update cosmetics.",
        ),
      );
    }
  }

  async addTitle(
    userId: UserId,
    guildId: GuildId,
    title: UserTitle,
  ): Promise<Result<boolean, AchievementError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.cosmetics);

      const _id = buildCosmeticsId(userId, guildId);

      const result = await collection.updateOne(
        { _id } as any,
        {
          $addToSet: { titles: title },
          $set: { updatedAt: new Date() },
        } as any,
        { upsert: true },
      );

      return OkResult(result.modifiedCount > 0 || result.upsertedCount > 0);
    } catch (error) {
      console.error("[AchievementRepository] addTitle error:", error);
      return ErrResult(
        new AchievementErrorClass("UPDATE_FAILED", "Failed to add title."),
      );
    }
  }

  async addBadge(
    userId: UserId,
    guildId: GuildId,
    badge: UserBadge,
  ): Promise<Result<boolean, AchievementError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.cosmetics);

      const _id = buildCosmeticsId(userId, guildId);

      const result = await collection.updateOne(
        { _id } as any,
        {
          $addToSet: { badges: badge },
          $set: { updatedAt: new Date() },
        } as any,
        { upsert: true },
      );

      return OkResult(result.modifiedCount > 0 || result.upsertedCount > 0);
    } catch (error) {
      console.error("[AchievementRepository] addBadge error:", error);
      return ErrResult(
        new AchievementErrorClass("UPDATE_FAILED", "Failed to add badge."),
      );
    }
  }

  async equipTitle(
    userId: UserId,
    guildId: GuildId,
    titleId: string,
  ): Promise<Result<EquippedTitle, AchievementError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.cosmetics);

      const _id = buildCosmeticsId(userId, guildId);

      // Get cosmetics to find title
      const cosmetics = await collection.findOne({ _id } as any);
      if (!cosmetics) {
        return ErrResult(
          new AchievementErrorClass("TITLE_NOT_OWNED", "User has no titles."),
        );
      }

      const title = (cosmetics.titles ?? []).find(
        (t: UserTitle) => t.id === titleId,
      );
      if (!title) {
        return ErrResult(
          new AchievementErrorClass(
            "TITLE_NOT_OWNED",
            `Title "${titleId}" not owned.`,
          ),
        );
      }

      const equippedTitle: EquippedTitle = {
        titleId: title.id,
        titleName: title.name,
        prefix: title.prefix,
        suffix: title.suffix,
        equippedAt: new Date(),
      };

      await collection.updateOne(
        { _id } as any,
        {
          $set: {
            equippedTitle,
            updatedAt: new Date(),
          },
        } as any,
      );

      return OkResult(equippedTitle);
    } catch (error) {
      console.error("[AchievementRepository] equipTitle error:", error);
      return ErrResult(
        new AchievementErrorClass("UPDATE_FAILED", "Failed to equip title."),
      );
    }
  }

  async unequipTitle(
    userId: UserId,
    guildId: GuildId,
  ): Promise<Result<boolean, AchievementError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.cosmetics);

      const _id = buildCosmeticsId(userId, guildId);

      const result = await collection.updateOne(
        { _id } as any,
        {
          $unset: { equippedTitle: "" },
          $set: { updatedAt: new Date() },
        } as any,
      );

      return OkResult(result.modifiedCount > 0);
    } catch (error) {
      console.error("[AchievementRepository] unequipTitle error:", error);
      return ErrResult(
        new AchievementErrorClass("UPDATE_FAILED", "Failed to unequip title."),
      );
    }
  }

  async setBadgeSlot(
    userId: UserId,
    guildId: GuildId,
    slot: 1 | 2 | 3,
    badgeId: string | null,
  ): Promise<Result<boolean, AchievementError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.cosmetics);

      const _id = buildCosmeticsId(userId, guildId);

      const updateKey = `badgeSlots.${slot - 1}`;

      const result = await collection.updateOne(
        { _id } as any,
        {
          $set: {
            [updateKey]: badgeId,
            updatedAt: new Date(),
          },
        } as any,
        { upsert: true },
      );

      return OkResult(result.modifiedCount > 0 || result.upsertedCount > 0);
    } catch (error) {
      console.error("[AchievementRepository] setBadgeSlot error:", error);
      return ErrResult(
        new AchievementErrorClass("UPDATE_FAILED", "Failed to set badge slot."),
      );
    }
  }
}

/** Singleton instance. */
export const achievementRepo: AchievementRepository =
  new AchievementRepositoryImpl();
