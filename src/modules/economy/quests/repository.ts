/**
 * Quest Repository.
 *
 * Purpose: Data access layer for quest templates, rotations, and user progress.
 * Context: Used by quest service. Follows repository pattern.
 * Dependencies: MongoDB, Zod schemas, Result pattern.
 */

import { getDb } from "@/db/mongo";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { UserId, GuildId } from "@/db/types";
import type {
  QuestTemplate,
  QuestRotation,
  QuestProgress,
  CreateQuestTemplateInput,
  QuestFilterOptions,
  QuestSortBy,
  QuestRotationConfig,
} from "./types";
import { QuestError } from "./types";

/** Collection names for quest data. */
const COLLECTIONS = {
  templates: "quest_templates",
  rotations: "quest_rotations",
  progress: "quest_progress",
  config: "quest_config",
} as const;

/** Build composite ID for quest progress. */
function buildProgressId(
  userId: UserId,
  rotationId: string,
  questId: string,
): string {
  return `${userId}:${rotationId}:${questId}`;
}

/** Repository for quest operations. */
export interface QuestRepository {
  // -------------------------------------------------------------------------
  // Quest Templates
  // -------------------------------------------------------------------------

  /** Create a new quest template. */
  createTemplate(
    guildId: GuildId,
    input: CreateQuestTemplateInput,
    createdBy: UserId,
  ): Promise<Result<QuestTemplate, QuestError>>;

  /** Get a quest template by ID. */
  getTemplate(
    guildId: GuildId,
    questId: string,
  ): Promise<Result<QuestTemplate | null, QuestError>>;

  /** Get all quest templates for a guild with optional filtering. */
  getTemplates(
    guildId: GuildId,
    filter?: QuestFilterOptions,
    sortBy?: QuestSortBy,
  ): Promise<Result<QuestTemplate[], QuestError>>;

  /** Update a quest template. */
  updateTemplate(
    guildId: GuildId,
    questId: string,
    updates: Partial<
      Omit<QuestTemplate, "id" | "guildId" | "createdAt" | "createdBy">
    >,
  ): Promise<Result<QuestTemplate, QuestError>>;

  /** Delete a quest template. */
  deleteTemplate(
    guildId: GuildId,
    questId: string,
  ): Promise<Result<boolean, QuestError>>;

  // -------------------------------------------------------------------------
  // Quest Rotations
  // -------------------------------------------------------------------------

  /** Create a new quest rotation. */
  createRotation(
    rotation: Omit<QuestRotation, "id" | "createdAt">,
  ): Promise<Result<QuestRotation, QuestError>>;

  /** Get current rotation for a guild and type. */
  getCurrentRotation(
    guildId: GuildId,
    type: "daily" | "weekly" | "featured",
  ): Promise<Result<QuestRotation | null, QuestError>>;

  /** Get rotation by ID. */
  getRotation(
    rotationId: string,
  ): Promise<Result<QuestRotation | null, QuestError>>;

  /** Expire old rotations. */
  expireOldRotations(
    guildId: GuildId,
    before: Date,
  ): Promise<Result<number, QuestError>>;

  // -------------------------------------------------------------------------
  // Quest Progress
  // -------------------------------------------------------------------------

  /** Get or create quest progress for a user. */
  getOrCreateProgress(
    userId: UserId,
    guildId: GuildId,
    rotationId: string,
    questId: string,
    requirementCount: number,
  ): Promise<Result<QuestProgress, QuestError>>;

  /** Update quest progress atomically. */
  updateProgress(
    userId: UserId,
    rotationId: string,
    questId: string,
    requirementIndex: number,
    increment: number,
    maxRequirementValue: number,
  ): Promise<Result<QuestProgress, QuestError>>;

  /** Mark quest as completed and claim rewards. */
  completeQuest(
    userId: UserId,
    rotationId: string,
    questId: string,
    maxCompletions: number,
  ): Promise<Result<QuestProgress, QuestError>>;

  /** Get progress for a specific quest. */
  getProgress(
    userId: UserId,
    rotationId: string,
    questId: string,
  ): Promise<Result<QuestProgress | null, QuestError>>;

  /** Get all progress for a user in a rotation. */
  getProgressForRotation(
    userId: UserId,
    rotationId: string,
  ): Promise<Result<QuestProgress[], QuestError>>;

  /** Get quest statistics for a user. */
  getUserStats(
    userId: UserId,
    guildId: GuildId,
  ): Promise<
    Result<
      {
        totalCompleted: number;
        questTokens: number;
      },
      QuestError
    >
  >;

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /** Get rotation config for a guild. */
  getRotationConfig(
    guildId: GuildId,
  ): Promise<Result<QuestRotationConfig, QuestError>>;

  /** Set rotation config for a guild. */
  setRotationConfig(
    guildId: GuildId,
    config: Partial<QuestRotationConfig>,
  ): Promise<Result<QuestRotationConfig, QuestError>>;
}

class QuestRepositoryImpl implements QuestRepository {
  // -------------------------------------------------------------------------
  // Quest Templates
  // -------------------------------------------------------------------------

  async createTemplate(
    guildId: GuildId,
    input: CreateQuestTemplateInput,
    createdBy: UserId,
  ): Promise<Result<QuestTemplate, QuestError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.templates);

      // Check for duplicate ID
      const existing = await collection.findOne({
        _id: `${guildId}:${input.id}`,
      } as any);
      if (existing) {
        return ErrResult(
          new QuestError(
            "DUPLICATE_QUEST_ID",
            `Quest with ID "${input.id}" already exists.`,
          ),
        );
      }

      const now = new Date();
      const template: QuestTemplate = {
        ...input,
        cooldownHours: input.cooldownHours ?? 24,
        maxCompletions: input.maxCompletions ?? 1,
        canBeFeatured: input.canBeFeatured ?? true,
        featuredMultiplier: input.featuredMultiplier ?? 1.5,
        enabled: input.enabled ?? true,
        createdAt: now,
        updatedAt: now,
        createdBy,
      };

      await collection.insertOne({
        _id: `${guildId}:${input.id}`,
        guildId,
        ...template,
      } as any);

      return OkResult(template);
    } catch (error) {
      console.error("[QuestRepository] createTemplate error:", error);
      return ErrResult(
        new QuestError("UPDATE_FAILED", "Failed to create quest template."),
      );
    }
  }

  async getTemplate(
    guildId: GuildId,
    questId: string,
  ): Promise<Result<QuestTemplate | null, QuestError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.templates);

      const doc = await collection.findOne({
        _id: `${guildId}:${questId}`,
      } as any);
      if (!doc) return OkResult(null);

      const template: QuestTemplate = {
        id: questId,
        name: doc.name,
        description: doc.description,
        category: doc.category,
        difficulty: doc.difficulty,
        requirements: doc.requirements,
        rewards: doc.rewards,
        cooldownHours: doc.cooldownHours,
        maxCompletions: doc.maxCompletions,
        minLevel: doc.minLevel,
        canBeFeatured: doc.canBeFeatured,
        featuredMultiplier: doc.featuredMultiplier,
        enabled: doc.enabled,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        createdBy: doc.createdBy,
      };

      return OkResult(template);
    } catch (error) {
      console.error("[QuestRepository] getTemplate error:", error);
      return ErrResult(
        new QuestError("UPDATE_FAILED", "Failed to get quest template."),
      );
    }
  }

  async getTemplates(
    guildId: GuildId,
    filter?: QuestFilterOptions,
    sortBy: QuestSortBy = "createdAt",
  ): Promise<Result<QuestTemplate[], QuestError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.templates);

      const query: Record<string, unknown> = { guildId };

      if (filter?.category) query.category = filter.category;
      if (filter?.difficulty) query.difficulty = filter.difficulty;
      if (filter?.enabled !== undefined) query.enabled = filter.enabled;
      if (filter?.canBeFeatured !== undefined)
        query.canBeFeatured = filter.canBeFeatured;

      const docs = await collection
        .find(query as any)
        .sort({ [sortBy]: 1 })
        .toArray();

      const templates: QuestTemplate[] = docs.map((doc) => ({
        id: String(doc._id).replace(`${guildId}:`, ""),
        name: doc.name,
        description: doc.description,
        category: doc.category,
        difficulty: doc.difficulty,
        requirements: doc.requirements,
        rewards: doc.rewards,
        cooldownHours: doc.cooldownHours,
        maxCompletions: doc.maxCompletions,
        minLevel: doc.minLevel,
        canBeFeatured: doc.canBeFeatured,
        featuredMultiplier: doc.featuredMultiplier,
        enabled: doc.enabled,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        createdBy: doc.createdBy,
      }));

      return OkResult(templates);
    } catch (error) {
      console.error("[QuestRepository] getTemplates error:", error);
      return ErrResult(
        new QuestError("UPDATE_FAILED", "Failed to get quest templates."),
      );
    }
  }

  async updateTemplate(
    guildId: GuildId,
    questId: string,
    updates: Partial<
      Omit<QuestTemplate, "id" | "guildId" | "createdAt" | "createdBy">
    >,
  ): Promise<Result<QuestTemplate, QuestError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.templates);

      const updateDoc: Record<string, unknown> = {
        ...updates,
        updatedAt: new Date(),
      };

      const result = await collection.findOneAndUpdate(
        { _id: `${guildId}:${questId}` } as any,
        { $set: updateDoc } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return ErrResult(
          new QuestError("QUEST_NOT_FOUND", `Quest "${questId}" not found.`),
        );
      }

      const template: QuestTemplate = {
        id: questId,
        name: result.name,
        description: result.description,
        category: result.category,
        difficulty: result.difficulty,
        requirements: result.requirements,
        rewards: result.rewards,
        cooldownHours: result.cooldownHours,
        maxCompletions: result.maxCompletions,
        minLevel: result.minLevel,
        canBeFeatured: result.canBeFeatured,
        featuredMultiplier: result.featuredMultiplier,
        enabled: result.enabled,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        createdBy: result.createdBy,
      };
      return OkResult(template);
    } catch (error) {
      console.error("[QuestRepository] updateTemplate error:", error);
      return ErrResult(
        new QuestError("UPDATE_FAILED", "Failed to update quest template."),
      );
    }
  }

  async deleteTemplate(
    guildId: GuildId,
    questId: string,
  ): Promise<Result<boolean, QuestError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.templates);

      const result = await collection.deleteOne({
        _id: `${guildId}:${questId}`,
      } as any);
      return OkResult(result.deletedCount > 0);
    } catch (error) {
      console.error("[QuestRepository] deleteTemplate error:", error);
      return ErrResult(
        new QuestError("UPDATE_FAILED", "Failed to delete quest template."),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Quest Rotations
  // -------------------------------------------------------------------------

  async createRotation(
    rotation: Omit<QuestRotation, "id" | "createdAt">,
  ): Promise<Result<QuestRotation, QuestError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.rotations);

      const id = `${rotation.guildId}:${rotation.type}:${Date.now()}`;
      const now = new Date();

      const newRotation: QuestRotation = {
        ...rotation,
        id,
        createdAt: now,
      };

      await collection.insertOne({
        _id: id,
        ...newRotation,
      } as any);

      return OkResult(newRotation);
    } catch (error) {
      console.error("[QuestRepository] createRotation error:", error);
      return ErrResult(
        new QuestError("UPDATE_FAILED", "Failed to create quest rotation."),
      );
    }
  }

  async getCurrentRotation(
    guildId: GuildId,
    type: "daily" | "weekly" | "featured",
  ): Promise<Result<QuestRotation | null, QuestError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.rotations);

      const now = new Date();

      const doc = await collection.findOne({
        guildId,
        type,
        startsAt: { $lte: now },
        endsAt: { $gt: now },
      } as any);

      if (!doc) return OkResult(null);

      const rotation: QuestRotation = {
        id: String(doc._id),
        guildId: doc.guildId,
        type: doc.type,
        startsAt: doc.startsAt,
        endsAt: doc.endsAt,
        questIds: doc.questIds,
        featuredQuestId: doc.featuredQuestId,
        createdAt: doc.createdAt,
      };

      return OkResult(rotation);
    } catch (error) {
      console.error("[QuestRepository] getCurrentRotation error:", error);
      return ErrResult(
        new QuestError("UPDATE_FAILED", "Failed to get current rotation."),
      );
    }
  }

  async getRotation(
    rotationId: string,
  ): Promise<Result<QuestRotation | null, QuestError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.rotations);

      const doc = await collection.findOne({ _id: rotationId } as any);
      if (!doc) return OkResult(null);

      const rotation: QuestRotation = {
        id: String(doc._id),
        guildId: doc.guildId,
        type: doc.type,
        startsAt: doc.startsAt,
        endsAt: doc.endsAt,
        questIds: doc.questIds,
        featuredQuestId: doc.featuredQuestId,
        createdAt: doc.createdAt,
      };

      return OkResult(rotation);
    } catch (error) {
      console.error("[QuestRepository] getRotation error:", error);
      return ErrResult(
        new QuestError("UPDATE_FAILED", "Failed to get rotation."),
      );
    }
  }

  async expireOldRotations(
    guildId: GuildId,
    before: Date,
  ): Promise<Result<number, QuestError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.rotations);

      const result = await collection.deleteMany({
        guildId,
        endsAt: { $lt: before },
      } as any);

      return OkResult(result.deletedCount);
    } catch (error) {
      console.error("[QuestRepository] expireOldRotations error:", error);
      return ErrResult(
        new QuestError("UPDATE_FAILED", "Failed to expire old rotations."),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Quest Progress
  // -------------------------------------------------------------------------

  async getOrCreateProgress(
    userId: UserId,
    guildId: GuildId,
    rotationId: string,
    questId: string,
    requirementCount: number,
  ): Promise<Result<QuestProgress, QuestError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.progress);

      const _id = buildProgressId(userId, rotationId, questId);
      const now = new Date();

      // Try to find existing
      const existing = await collection.findOne({ _id } as any);
      if (existing) {
        const progress: QuestProgress = {
          _id,
          userId: existing.userId,
          guildId: existing.guildId,
          rotationId: existing.rotationId,
          questId: existing.questId,
          requirementProgress: existing.requirementProgress,
          completed: existing.completed,
          completedAt: existing.completedAt,
          completionCount: existing.completionCount,
          rewardsClaimed: existing.rewardsClaimed,
          rewardsClaimedAt: existing.rewardsClaimedAt,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        };
        return OkResult(progress);
      }

      // Create new
      const progress: QuestProgress = {
        _id,
        userId,
        guildId,
        rotationId,
        questId,
        requirementProgress: new Array(requirementCount).fill(0),
        completed: false,
        completionCount: 0,
        rewardsClaimed: false,
        createdAt: now,
        updatedAt: now,
      };

      await collection.insertOne({ ...progress } as any);
      return OkResult(progress);
    } catch (error) {
      console.error("[QuestRepository] getOrCreateProgress error:", error);
      return ErrResult(
        new QuestError("UPDATE_FAILED", "Failed to get or create progress."),
      );
    }
  }

  async updateProgress(
    userId: UserId,
    rotationId: string,
    questId: string,
    requirementIndex: number,
    increment: number,
    maxRequirementValue: number,
  ): Promise<Result<QuestProgress, QuestError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.progress);

      const _id = buildProgressId(userId, rotationId, questId);
      const now = new Date();

      // Use $min to cap progress at max requirement value
      const result = await collection.findOneAndUpdate(
        { _id } as any,
        {
          $inc: { [`requirementProgress.${requirementIndex}`]: increment },
          $set: { updatedAt: now },
        } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return ErrResult(
          new QuestError("QUEST_NOT_FOUND", "Quest progress not found."),
        );
      }

      // Cap at max
      const currentProgress = result.requirementProgress[requirementIndex];
      if (currentProgress > maxRequirementValue) {
        await collection.updateOne(
          { _id } as any,
          {
            $set: {
              [`requirementProgress.${requirementIndex}`]: maxRequirementValue,
            },
          } as any,
        );
        result.requirementProgress[requirementIndex] = maxRequirementValue;
      }

      const progress: QuestProgress = {
        _id,
        userId: result.userId,
        guildId: result.guildId,
        rotationId: result.rotationId,
        questId: result.questId,
        requirementProgress: result.requirementProgress,
        completed: result.completed,
        completedAt: result.completedAt,
        completionCount: result.completionCount,
        rewardsClaimed: result.rewardsClaimed,
        rewardsClaimedAt: result.rewardsClaimedAt,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      };

      return OkResult(progress);
    } catch (error) {
      console.error("[QuestRepository] updateProgress error:", error);
      return ErrResult(
        new QuestError("UPDATE_FAILED", "Failed to update quest progress."),
      );
    }
  }

  async completeQuest(
    userId: UserId,
    rotationId: string,
    questId: string,
    maxCompletions: number,
  ): Promise<Result<QuestProgress, QuestError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.progress);

      const _id = buildProgressId(userId, rotationId, questId);
      const now = new Date();

      // Only complete if not already completed and under max completions
      const result = await collection.findOneAndUpdate(
        {
          _id,
          completed: false,
          completionCount: { $lt: maxCompletions },
        } as any,
        {
          $set: {
            completed: true,
            completedAt: now,
            updatedAt: now,
          },
          $inc: { completionCount: 1 },
        } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        // Check if already completed or max reached
        const existing = await collection.findOne({ _id } as any);
        if (existing?.completed) {
          return ErrResult(
            new QuestError(
              "QUEST_ALREADY_COMPLETED",
              "Quest already completed.",
            ),
          );
        }
        if (existing?.completionCount >= maxCompletions) {
          return ErrResult(
            new QuestError(
              "MAX_COMPLETIONS_REACHED",
              "Maximum completions reached.",
            ),
          );
        }
        return ErrResult(
          new QuestError("UPDATE_FAILED", "Failed to complete quest."),
        );
      }

      const progress: QuestProgress = {
        _id,
        userId: result.userId,
        guildId: result.guildId,
        rotationId: result.rotationId,
        questId: result.questId,
        requirementProgress: result.requirementProgress,
        completed: result.completed,
        completedAt: result.completedAt,
        completionCount: result.completionCount,
        rewardsClaimed: result.rewardsClaimed,
        rewardsClaimedAt: result.rewardsClaimedAt,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      };

      return OkResult(progress);
    } catch (error) {
      console.error("[QuestRepository] completeQuest error:", error);
      return ErrResult(
        new QuestError("UPDATE_FAILED", "Failed to complete quest."),
      );
    }
  }

  async getProgress(
    userId: UserId,
    rotationId: string,
    questId: string,
  ): Promise<Result<QuestProgress | null, QuestError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.progress);

      const _id = buildProgressId(userId, rotationId, questId);
      const doc = await collection.findOne({ _id } as any);

      if (!doc) return OkResult(null);

      const progress: QuestProgress = {
        _id,
        userId: doc.userId,
        guildId: doc.guildId,
        rotationId: doc.rotationId,
        questId: doc.questId,
        requirementProgress: doc.requirementProgress,
        completed: doc.completed,
        completedAt: doc.completedAt,
        completionCount: doc.completionCount,
        rewardsClaimed: doc.rewardsClaimed,
        rewardsClaimedAt: doc.rewardsClaimedAt,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };

      return OkResult(progress);
    } catch (error) {
      console.error("[QuestRepository] getProgress error:", error);
      return ErrResult(
        new QuestError("UPDATE_FAILED", "Failed to get quest progress."),
      );
    }
  }

  async getProgressForRotation(
    userId: UserId,
    rotationId: string,
  ): Promise<Result<QuestProgress[], QuestError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.progress);

      const docs = await collection
        .find({ userId, rotationId } as any)
        .toArray();

      const progressList: QuestProgress[] = docs.map((doc) => ({
        _id: String(doc._id),
        userId: doc.userId,
        guildId: doc.guildId,
        rotationId: doc.rotationId,
        questId: doc.questId,
        requirementProgress: doc.requirementProgress,
        completed: doc.completed,
        completedAt: doc.completedAt,
        completionCount: doc.completionCount,
        rewardsClaimed: doc.rewardsClaimed,
        rewardsClaimedAt: doc.rewardsClaimedAt,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }));

      return OkResult(progressList);
    } catch (error) {
      console.error("[QuestRepository] getProgressForRotation error:", error);
      return ErrResult(
        new QuestError("UPDATE_FAILED", "Failed to get progress for rotation."),
      );
    }
  }

  async getUserStats(
    userId: UserId,
    guildId: GuildId,
  ): Promise<
    Result<{ totalCompleted: number; questTokens: number }, QuestError>
  > {
    try {
      const db = await getDb();
      const progressCollection = db.collection(COLLECTIONS.progress);

      const result = await progressCollection
        .aggregate([
          { $match: { userId, guildId } as any },
          {
            $group: {
              _id: null,
              totalCompleted: { $sum: "$completionCount" },
            },
          },
        ])
        .toArray();

      // Get quest tokens from user currency (stored as "quest_tokens")
      const usersCol = db.collection("users");
      const userDoc = await usersCol.findOne({ _id: userId } as any);
      const questTokens = (userDoc?.currency?.quest_tokens as number) ?? 0;

      return OkResult({
        totalCompleted: result[0]?.totalCompleted ?? 0,
        questTokens,
      });
    } catch (error) {
      console.error("[QuestRepository] getUserStats error:", error);
      return ErrResult(
        new QuestError("UPDATE_FAILED", "Failed to get user stats."),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  async getRotationConfig(
    guildId: GuildId,
  ): Promise<Result<QuestRotationConfig, QuestError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.config);

      const doc = await collection.findOne({ _id: guildId } as any);
      if (!doc) {
        // Return default config
        return OkResult({
          dailyQuestCount: 3,
          weeklyQuestCount: 5,
          featuredEnabled: true,
          dailyResetHour: 0,
          weeklyResetDay: 1,
          weeklyResetHour: 0,
        });
      }

      return OkResult({
        dailyQuestCount: doc.dailyQuestCount ?? 3,
        weeklyQuestCount: doc.weeklyQuestCount ?? 5,
        featuredEnabled: doc.featuredEnabled ?? true,
        dailyResetHour: doc.dailyResetHour ?? 0,
        weeklyResetDay: doc.weeklyResetDay ?? 1,
        weeklyResetHour: doc.weeklyResetHour ?? 0,
      });
    } catch (error) {
      console.error("[QuestRepository] getRotationConfig error:", error);
      return ErrResult(
        new QuestError("UPDATE_FAILED", "Failed to get rotation config."),
      );
    }
  }

  async setRotationConfig(
    guildId: GuildId,
    config: Partial<QuestRotationConfig>,
  ): Promise<Result<QuestRotationConfig, QuestError>> {
    try {
      const db = await getDb();
      const collection = db.collection(COLLECTIONS.config);

      await collection.updateOne(
        { _id: guildId } as any,
        { $set: { ...config, updatedAt: new Date() } } as any,
        { upsert: true },
      );

      return this.getRotationConfig(guildId);
    } catch (error) {
      console.error("[QuestRepository] setRotationConfig error:", error);
      return ErrResult(
        new QuestError("UPDATE_FAILED", "Failed to set rotation config."),
      );
    }
  }
}

export const questRepo: QuestRepository = new QuestRepositoryImpl();
