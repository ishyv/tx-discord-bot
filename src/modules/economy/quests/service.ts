/**
 * Quest Service.
 *
 * Purpose: Business logic for quest management, progress tracking, and reward claiming.
 * Context: Used by commands and event listeners. Coordinates between repository,
 * progression service, item mutation service, and currency mutation service.
 * Dependencies: QuestRepository, ProgressionService, ItemMutationService, CurrencyMutationService.
 */

import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { UserId, GuildId } from "@/db/types";
import { economyAuditRepo } from "../audit/repository";
import { progressionService } from "../progression/service";
import { itemMutationService } from "../mutations/items/service";
import { currencyMutationService } from "../mutations/service";
import { guildEconomyService } from "../guild/service";
import { questRepo } from "./repository";
import type {
  QuestTemplate,
  QuestRotation,
  QuestProgress,
  QuestView,
  QuestBoardView,
  CreateQuestTemplateInput,
  UpdateQuestProgressInput,
  ClaimQuestRewardsInput,
  ClaimQuestRewardsResult,
  AppliedReward,
  QuestStats,
  QuestRequirement,
  QuestRequirementType,
  QuestReward,
  CurrencyReward,
  ItemReward,
  QuestRotationConfig,
} from "./types";
import { QuestError } from "./types";

/** Service for quest operations. */
export class QuestService {
  // -------------------------------------------------------------------------
  // Template Management
  // -------------------------------------------------------------------------

  async createTemplate(
    guildId: GuildId,
    input: CreateQuestTemplateInput,
    createdBy: UserId,
  ): Promise<Result<QuestTemplate, QuestError>> {
    // Validate requirements
    if (!input.requirements || input.requirements.length === 0) {
      return ErrResult(
        new QuestError(
          "INVALID_TEMPLATE",
          "Quest must have at least one requirement.",
        ),
      );
    }

    // Validate rewards
    if (!input.rewards || input.rewards.length === 0) {
      return ErrResult(
        new QuestError(
          "INVALID_TEMPLATE",
          "Quest must have at least one reward.",
        ),
      );
    }

    return questRepo.createTemplate(guildId, input, createdBy);
  }

  async getTemplate(
    guildId: GuildId,
    questId: string,
  ): Promise<Result<QuestTemplate | null, QuestError>> {
    return questRepo.getTemplate(guildId, questId);
  }

  async listTemplates(
    guildId: GuildId,
  ): Promise<Result<QuestTemplate[], QuestError>> {
    return questRepo.getTemplates(guildId, { enabled: true });
  }

  // -------------------------------------------------------------------------
  // Rotation Management
  // -------------------------------------------------------------------------

  async getQuestBoard(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<QuestBoardView, QuestError>> {
    // Get current rotations
    const [dailyRotation, weeklyRotation, featuredRotation, stats] =
      await Promise.all([
        questRepo.getCurrentRotation(guildId, "daily"),
        questRepo.getCurrentRotation(guildId, "weekly"),
        questRepo.getCurrentRotation(guildId, "featured"),
        questRepo.getUserStats(userId, guildId),
      ]);

    if (dailyRotation.isErr()) return ErrResult(dailyRotation.error);
    if (weeklyRotation.isErr()) return ErrResult(weeklyRotation.error);

    // Build daily view
    const dailyQuests: QuestView[] = [];
    if (dailyRotation.unwrap()) {
      const rotation = dailyRotation.unwrap()!;
      for (const questId of rotation.questIds) {
        const templateResult = await questRepo.getTemplate(guildId, questId);
        if (templateResult.isErr() || !templateResult.unwrap()) continue;

        const template = templateResult.unwrap()!;
        const progressResult = await questRepo.getProgress(
          userId,
          rotation.id,
          questId,
        );
        const progress = progressResult.isOk() ? progressResult.unwrap() : null;

        dailyQuests.push(await buildQuestView(template, rotation, progress));
      }
    }

    // Build weekly view
    const weeklyQuests: QuestView[] = [];
    if (weeklyRotation.unwrap()) {
      const rotation = weeklyRotation.unwrap()!;
      for (const questId of rotation.questIds) {
        const templateResult = await questRepo.getTemplate(guildId, questId);
        if (templateResult.isErr() || !templateResult.unwrap()) continue;

        const template = templateResult.unwrap()!;
        const progressResult = await questRepo.getProgress(
          userId,
          rotation.id,
          questId,
        );
        const progress = progressResult.isOk() ? progressResult.unwrap() : null;

        weeklyQuests.push(await buildQuestView(template, rotation, progress));
      }
    }

    // Build featured view
    let featuredQuest: QuestView | undefined;
    if (
      featuredRotation.unwrap() &&
      featuredRotation.unwrap()!.featuredQuestId
    ) {
      const rotation = featuredRotation.unwrap()!;
      const templateResult = await questRepo.getTemplate(
        guildId,
        rotation.featuredQuestId!,
      );
      if (templateResult.isOk() && templateResult.unwrap()) {
        const template = templateResult.unwrap()!;
        const progressResult = await questRepo.getProgress(
          userId,
          rotation.id,
          template.id,
        );
        const progress = progressResult.isOk() ? progressResult.unwrap() : null;
        featuredQuest = await buildQuestView(template, rotation, progress);
      }
    }

    return OkResult({
      daily: {
        type: "daily",
        quests: dailyQuests,
        expiresAt: dailyRotation.unwrap()?.endsAt ?? new Date(),
        isActive: dailyQuests.length > 0,
      },
      weekly: {
        type: "weekly",
        quests: weeklyQuests,
        expiresAt: weeklyRotation.unwrap()?.endsAt ?? new Date(),
        isActive: weeklyQuests.length > 0,
      },
      featured: featuredQuest,
      totalCompleted: stats.isOk() ? stats.unwrap().totalCompleted : 0,
      questTokens: stats.isOk() ? stats.unwrap().questTokens : 0,
    });
  }

  async getQuestView(
    guildId: GuildId,
    userId: UserId,
    rotationId: string,
    questId: string,
  ): Promise<Result<QuestView | null, QuestError>> {
    const [templateResult, rotationResult, progressResult] = await Promise.all([
      questRepo.getTemplate(guildId, questId),
      questRepo.getRotation(rotationId),
      questRepo.getProgress(userId, rotationId, questId),
    ]);

    if (templateResult.isErr()) return ErrResult(templateResult.error);
    if (rotationResult.isErr()) return ErrResult(rotationResult.error);

    const template = templateResult.unwrap();
    const rotation = rotationResult.unwrap();

    if (!template) return OkResult(null);
    if (!rotation) return OkResult(null);

    const progress = progressResult.isOk() ? progressResult.unwrap() : null;
    return OkResult(await buildQuestView(template, rotation, progress));
  }

  // -------------------------------------------------------------------------
  // Progress Tracking
  // -------------------------------------------------------------------------

  async updateProgress(
    input: UpdateQuestProgressInput,
  ): Promise<Result<QuestProgress, QuestError>> {
    // Get quest template
    const templateResult = await questRepo.getTemplate(
      input.guildId,
      input.questId,
    );
    if (templateResult.isErr()) return ErrResult(templateResult.error);
    if (!templateResult.unwrap()) {
      return ErrResult(new QuestError("QUEST_NOT_FOUND", "Quest not found."));
    }

    const template = templateResult.unwrap()!;

    // Check if quest is enabled
    if (!template.enabled) {
      return ErrResult(new QuestError("QUEST_DISABLED", "Quest is disabled."));
    }

    // Get or create progress
    const progressResult = await questRepo.getOrCreateProgress(
      input.userId,
      input.guildId,
      input.rotationId,
      input.questId,
      template.requirements.length,
    );
    if (progressResult.isErr()) return ErrResult(progressResult.error);

    // Check if already completed for this rotation
    const progress = progressResult.unwrap();
    if (progress.completed) {
      // Already completed, don't update progress further
      return OkResult(progress);
    }

    // Find matching requirement
    const reqIndex = findRequirementIndex(template, input.requirementType);
    if (reqIndex === -1) {
      // No matching requirement for this event type
      return OkResult(progress);
    }

    // Check if metadata matches (e.g., specific command, recipe, etc.)
    const req = template.requirements[reqIndex];
    if (!matchesRequirement(req, input.metadata)) {
      return OkResult(progress);
    }

    // Get max value for this requirement
    const maxValue = getRequirementTarget(req);

    // Update progress
    const updateResult = await questRepo.updateProgress(
      input.userId,
      input.rotationId,
      input.questId,
      reqIndex,
      input.increment,
      maxValue,
    );

    return updateResult;
  }

  async checkAndCompleteQuest(
    userId: UserId,
    rotationId: string,
    questId: string,
  ): Promise<Result<QuestProgress, QuestError>> {
    // Get template and progress
    const rotationResult = await questRepo.getRotation(rotationId);
    if (rotationResult.isErr()) return ErrResult(rotationResult.error);
    if (!rotationResult.unwrap()) {
      return ErrResult(
        new QuestError("ROTATION_NOT_FOUND", "Rotation not found."),
      );
    }

    const rotation = rotationResult.unwrap()!;
    const templateResult = await questRepo.getTemplate(
      rotation.guildId,
      questId,
    );
    if (templateResult.isErr()) return ErrResult(templateResult.error);
    if (!templateResult.unwrap()) {
      return ErrResult(new QuestError("QUEST_NOT_FOUND", "Quest not found."));
    }

    const template = templateResult.unwrap()!;

    const progressResult = await questRepo.getProgress(
      userId,
      rotationId,
      questId,
    );
    if (progressResult.isErr()) return ErrResult(progressResult.error);
    if (!progressResult.unwrap()) {
      return ErrResult(
        new QuestError("QUEST_NOT_FOUND", "Quest progress not found."),
      );
    }

    const progress = progressResult.unwrap()!;

    // Check if already completed
    if (progress.completed) {
      return ErrResult(
        new QuestError("QUEST_ALREADY_COMPLETED", "Quest already completed."),
      );
    }

    // Check if all requirements are met
    if (!areRequirementsMet(template, progress)) {
      return ErrResult(
        new QuestError("QUEST_NOT_COMPLETED", "Quest requirements not met."),
      );
    }

    // Complete the quest
    return questRepo.completeQuest(
      userId,
      rotationId,
      questId,
      template.maxCompletions,
    );
  }

  // -------------------------------------------------------------------------
  // Reward Claiming
  // -------------------------------------------------------------------------

  async claimRewards(
    input: ClaimQuestRewardsInput,
  ): Promise<Result<ClaimQuestRewardsResult, QuestError>> {
    const { guildId, userId, rotationId, questId } = input;

    // Get rotation
    const rotationResult = await questRepo.getRotation(rotationId);
    if (rotationResult.isErr()) return ErrResult(rotationResult.error);
    if (!rotationResult.unwrap()) {
      return ErrResult(
        new QuestError("ROTATION_NOT_FOUND", "Rotation not found."),
      );
    }
    const rotation = rotationResult.unwrap()!;

    // Get template
    const templateResult = await questRepo.getTemplate(guildId, questId);
    if (templateResult.isErr()) return ErrResult(templateResult.error);
    if (!templateResult.unwrap()) {
      return ErrResult(new QuestError("QUEST_NOT_FOUND", "Quest not found."));
    }
    const template = templateResult.unwrap()!;

    // Get progress
    const progressResult = await questRepo.getProgress(
      userId,
      rotationId,
      questId,
    );
    if (progressResult.isErr()) return ErrResult(progressResult.error);
    if (!progressResult.unwrap()) {
      return ErrResult(
        new QuestError("QUEST_NOT_FOUND", "Quest progress not found."),
      );
    }
    const progress = progressResult.unwrap()!;

    // Check if completed
    if (!progress.completed) {
      return ErrResult(
        new QuestError("QUEST_NOT_COMPLETED", "Quest not completed."),
      );
    }

    // Check if already claimed
    if (progress.rewardsClaimed) {
      return ErrResult(
        new QuestError("REWARDS_ALREADY_CLAIMED", "Rewards already claimed."),
      );
    }

    // Calculate rewards with multiplier
    const isFeatured = rotation.featuredQuestId === questId;
    const multiplier = isFeatured ? template.featuredMultiplier : 1;

    const correlationId = `quest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const appliedRewards: AppliedReward[] = [];
    const errors: string[] = [];

    // Apply rewards
    for (const reward of template.rewards) {
      const result = await applyReward(
        reward,
        userId,
        guildId,
        multiplier,
        correlationId,
      );
      if (result.isErr()) {
        errors.push(result.error.message);
      } else {
        appliedRewards.push(result.unwrap());
      }
    }

    // If any errors, don't mark as claimed
    if (errors.length > 0) {
      return ErrResult(
        new QuestError(
          "UPDATE_FAILED",
          `Failed to apply rewards: ${errors.join(", ")}`,
        ),
      );
    }

    // Mark rewards as claimed
    const db = await import("@/db/mongo").then((m) => m.getDb());
    const collection = db.collection("quest_progress");
    await collection.updateOne(
      { _id: progress._id } as any,
      { $set: { rewardsClaimed: true, rewardsClaimedAt: new Date() } } as any,
    );

    // Create audit entry
    await economyAuditRepo.create({
      operationType: "quest_complete",
      actorId: userId,
      targetId: userId,
      guildId,
      source: "quest",
      reason: `Completed quest: ${template.name}`,
      metadata: {
        correlationId,
        questId,
        rotationId,
        rotationType: rotation.type,
        isFeatured,
        rewards: appliedRewards.map((r) => ({
          type: r.type,
          amount: r.amount,
        })),
        requirementProgress: progress.requirementProgress,
      },
    });

    return OkResult({
      questId,
      rotationId,
      rewards: appliedRewards,
      correlationId,
    });
  }

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  async getStats(
    userId: UserId,
    guildId: GuildId,
  ): Promise<Result<QuestStats, QuestError>> {
    const [statsResult, progressResult] = await Promise.all([
      questRepo.getUserStats(userId, guildId),
      questRepo.getProgressForRotation(userId, "all"),
    ]);

    if (statsResult.isErr()) return ErrResult(statsResult.error);

    const stats = statsResult.unwrap();

    // Calculate completion counts by rotation type
    let dailyCompleted = 0;
    let weeklyCompleted = 0;
    let featuredCompleted = 0;

    // Get rotation info for each progress entry
    if (progressResult.isOk()) {
      const allProgress = progressResult.unwrap();
      for (const progress of allProgress) {
        const rotationResult = await questRepo.getRotation(progress.rotationId);
        if (rotationResult.isOk() && rotationResult.unwrap()) {
          const rotation = rotationResult.unwrap()!;
          if (rotation.type === "daily")
            dailyCompleted += progress.completionCount;
          if (rotation.type === "weekly")
            weeklyCompleted += progress.completionCount;
          if (rotation.type === "featured")
            featuredCompleted += progress.completionCount;
        }
      }
    }

    return OkResult({
      userId,
      guildId,
      totalCompleted: stats.totalCompleted,
      dailyCompleted,
      weeklyCompleted,
      featuredCompleted,
      questTokens: stats.questTokens,
      favoriteCategory: undefined, // Would need more complex aggregation
      currentStreak: 0, // TODO: Implement streak tracking
      bestStreak: 0,
    });
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  async getConfig(
    guildId: GuildId,
  ): Promise<Result<QuestRotationConfig, QuestError>> {
    return questRepo.getRotationConfig(guildId);
  }
}

/** Build requirement description. */
function buildRequirementDescription(req: QuestRequirement): string {
  switch (req.type) {
    case "do_command":
      return `Use the command "/${req.command}" ${req.count} veces`;
    case "spend_currency":
      return `Gasta ${req.amount} ${req.currencyId}`;
    case "craft_recipe":
      return `Craft recipe "${req.recipeId}" ${req.count} times`;
    case "win_minigame":
      return `Gana ${req.count} veces en ${req.game}`;
    case "vote_cast":
      return `Vota ${req.count} veces con ${req.voteType === "love" ? "💝" : "💔"}`;
    default:
      return "Requisito desconocido";
  }
}

/** Build a quest view with progress info. */
async function buildQuestView(
  template: QuestTemplate,
  rotation: QuestRotation,
  progress: QuestProgress | null,
): Promise<QuestView> {
  const isFeatured = rotation.featuredQuestId === template.id;
  const multiplier = isFeatured ? template.featuredMultiplier : 1;

  const requirementViews = template.requirements.map((req, idx) => ({
    type: req.type,
    description: buildRequirementDescription(req),
    current: progress?.requirementProgress[idx] ?? 0,
    target: getRequirementTarget(req),
    completed:
      (progress?.requirementProgress[idx] ?? 0) >= getRequirementTarget(req),
  }));

  const completedCount = requirementViews.filter((r) => r.completed).length;
  const totalCount = requirementViews.length;
  const percentComplete =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Apply multiplier to rewards
  const scaledRewards = template.rewards.map((reward) => {
    if (
      reward.type === "currency" ||
      reward.type === "xp" ||
      reward.type === "quest_token"
    ) {
      return { ...reward, amount: Math.floor(reward.amount * multiplier) };
    }
    return reward;
  });

  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    difficulty: template.difficulty,
    requirements: requirementViews,
    rewards: scaledRewards,
    isFeatured,
    rewardMultiplier: multiplier,
    progress: progress
      ? {
          percentComplete,
          isCompleted: progress.completed,
          isClaimed: progress.rewardsClaimed,
          completions: progress.completionCount,
          maxCompletions: template.maxCompletions,
        }
      : undefined,
    expiresAt: rotation.endsAt,
  };
}

/** Get target value from requirement. */
function getRequirementTarget(req: QuestRequirement): number {
  switch (req.type) {
    case "do_command":
      return req.count;
    case "spend_currency":
      return req.amount;
    case "craft_recipe":
      return req.count;
    case "win_minigame":
      return req.count;
    case "vote_cast":
      return req.count;
    default:
      return 0;
  }
}

/** Check if all requirements are met. */
function areRequirementsMet(
  template: QuestTemplate,
  progress: QuestProgress,
): boolean {
  if (progress.requirementProgress.length !== template.requirements.length) {
    return false;
  }

  for (let i = 0; i < template.requirements.length; i++) {
    const target = getRequirementTarget(template.requirements[i]);
    if ((progress.requirementProgress[i] ?? 0) < target) {
      return false;
    }
  }

  return true;
}

/** Find requirement index by type (best effort match). */
function findRequirementIndex(
  template: QuestTemplate,
  type: QuestRequirementType,
): number {
  return template.requirements.findIndex((r) => r.type === type);
}

/** Check if metadata matches a requirement. */
function matchesRequirement(
  req: QuestRequirement,
  metadata?: Record<string, unknown>,
): boolean {
  if (!metadata) return true;

  switch (req.type) {
    case "do_command":
      return metadata.command === req.command;
    case "spend_currency":
      return metadata.currencyId === req.currencyId;
    case "craft_recipe":
      return metadata.recipeId === req.recipeId;
    case "win_minigame":
      return metadata.game === req.game;
    case "vote_cast":
      return metadata.voteType === req.voteType;
    default:
      return true;
  }
}

/** Apply a single reward. */
async function applyReward(
  reward: QuestReward,
  userId: UserId,
  guildId: string,
  multiplier: number,
  correlationId: string,
): Promise<Result<AppliedReward, Error>> {
  const amount = Math.floor(
    (reward.type === "currency" ||
    reward.type === "xp" ||
    reward.type === "quest_token"
      ? reward.amount
      : (reward as ItemReward).quantity) * multiplier,
  );

  switch (reward.type) {
    case "currency": {
      const currencyReward = reward as CurrencyReward;
      const source = currencyReward.source ?? "mint";

      if (source === "guild_sector" && currencyReward.sector) {
        // Withdraw from guild sector
        const withdrawResult = await guildEconomyService.withdrawFromSector({
          guildId,
          sector: currencyReward.sector,
          amount,
          source: "quest_reward",
          reason: `Quest reward for ${userId}`,
        });

        if (withdrawResult.isErr()) {
          return ErrResult(
            new Error(
              `Failed to withdraw from sector: ${withdrawResult.error?.message}`,
            ),
          );
        }
      }

      // Grant currency to user
      const adjustResult = await currencyMutationService.adjustCurrencyBalance(
        {
          actorId: userId,
          targetId: userId,
          guildId,
          currencyId: currencyReward.currencyId,
          delta: amount,
          reason: "Quest reward",
        },
        async () => true,
      );

      if (adjustResult.isErr()) {
        return ErrResult(
          new Error(`Failed to grant currency: ${adjustResult.error?.message}`),
        );
      }

      return OkResult({
        type: "currency",
        description: `${amount} ${currencyReward.currencyId}`,
        amount,
      });
    }

    case "xp": {
      const xpRes = await progressionService.addXP({
        guildId,
        userId,
        sourceOp: "quest_complete",
        amount,
        correlationId,
        metadata: { rewardType: "quest" },
      });

      if (xpRes.isErr()) {
        return ErrResult(
          new Error(`Failed to grant XP: ${xpRes.error?.message}`),
        );
      }

      return OkResult({
        type: "xp",
        description: `${amount} XP`,
        amount,
      });
    }

    case "item": {
      const itemReward = reward as ItemReward;
      const itemResult = await itemMutationService.adjustItemQuantity(
        {
          actorId: userId,
          targetId: userId,
          guildId,
          itemId: itemReward.itemId,
          delta: amount,
          reason: "Quest reward",
        },
        async () => true,
      );

      if (itemResult.isErr()) {
        return ErrResult(
          new Error(`Failed to grant item: ${itemResult.error?.message}`),
        );
      }

      return OkResult({
        type: "item",
        description: `${amount}x ${itemReward.itemId}`,
        amount,
      });
    }

    case "quest_token": {
      const tokenResult = await currencyMutationService.adjustCurrencyBalance(
        {
          actorId: userId,
          targetId: userId,
          guildId,
          currencyId: "quest_tokens",
          delta: amount,
          reason: "Quest token reward",
        },
        async () => true,
      );

      if (tokenResult.isErr()) {
        return ErrResult(
          new Error(
            `Failed to grant quest tokens: ${tokenResult.error?.message}`,
          ),
        );
      }

      return OkResult({
        type: "quest_token",
        description: `${amount} Quest Tokens`,
        amount,
      });
    }

    default:
      return ErrResult(
        new Error(`Unknown reward type: ${(reward as QuestReward).type}`),
      );
  }
}

export const questService = new QuestService();


