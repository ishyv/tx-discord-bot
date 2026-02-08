/**
 * Achievements Service.
 *
 * Purpose: Business logic for achievement evaluation, unlock tracking, and reward claiming.
 * Context: Used by commands and event listeners. Evaluates unlocks from audit logs and hooks.
 * Dependencies: AchievementRepository, ProgressionService, CurrencyMutationService, AuditRepo.
 */

import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { UserId, GuildId } from "@/db/types";
import { achievementRepo } from "./repository";
import {
  getAchievementDefinition,
  getAllAchievementDefinitions,
} from "./definitions";
import { progressionService } from "../progression/service";
import { currencyMutationService } from "../mutations/service";
import { economyAuditRepo } from "../audit/repository";
import type {
  AchievementView,
  AchievementBoardView,
  AchievementProgressView,
  ClaimAchievementRewardsInput,
  ClaimAchievementRewardsResult,
  AppliedAchievementReward,
  EquipTitleInput,
  EquippedTitle,
  ProfileCosmetics,
  UserBadge,
  TitleView,
  AchievementReward,
  AchievementError,
  AchievementTier,
  AchievementCategory,
  UnlockConditionType,
} from "./types";
import {
  AchievementError as AchievementErrorClass,
  TIER_DISPLAY,
  MAX_XP_REWARD,
  MAX_CURRENCY_REWARD,
} from "./types";
import type { AchievementDefinition } from "./types";

/** Service for achievement operations. */
export class AchievementService {
  // -------------------------------------------------------------------------
  // Achievement Views
  // -------------------------------------------------------------------------

  async getAchievementBoard(
    userId: UserId,
    guildId: GuildId,
  ): Promise<Result<AchievementBoardView, AchievementError>> {
    const definitions = getAllAchievementDefinitions();
    const achievementViews: AchievementView[] = [];

    for (const definition of definitions) {
      achievementViews.push(
        await buildAchievementView(userId, guildId, definition),
      );
    }

    // Sort by display order
    achievementViews.sort((a, b) => {
      const defA = getAchievementDefinition(a.id)!;
      const defB = getAchievementDefinition(b.id)!;
      return defA.displayOrder - defB.displayOrder;
    });

    const unlockedCount = achievementViews.filter((a) => a.isUnlocked).length;

    // Count by tier
    const byTier: Record<AchievementTier, { unlocked: number; total: number }> =
      {
        bronze: { unlocked: 0, total: 0 },
        silver: { unlocked: 0, total: 0 },
        gold: { unlocked: 0, total: 0 },
        platinum: { unlocked: 0, total: 0 },
        diamond: { unlocked: 0, total: 0 },
      };

    // Count by category
    const byCategory: Record<
      AchievementCategory,
      { unlocked: number; total: number }
    > = {
      progression: { unlocked: 0, total: 0 },
      minigame: { unlocked: 0, total: 0 },
      crafting: { unlocked: 0, total: 0 },
      social: { unlocked: 0, total: 0 },
      collection: { unlocked: 0, total: 0 },
      special: { unlocked: 0, total: 0 },
    };

    for (const view of achievementViews) {
      byTier[view.tier].total++;
      byCategory[view.category].total++;
      if (view.isUnlocked) {
        byTier[view.tier].unlocked++;
        byCategory[view.category].unlocked++;
      }
    }

    // Find next achievement (highest progress % not completed)
    const incomplete = achievementViews.filter(
      (a) => !a.isUnlocked && a.progress,
    );
    const nextAchievement = incomplete.sort(
      (a, b) => (b.progress?.percent ?? 0) - (a.progress?.percent ?? 0),
    )[0];

    // Recently unlocked (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentlyUnlocked = achievementViews
      .filter(
        (a) => a.isUnlocked && a.unlockedAt && a.unlockedAt > sevenDaysAgo,
      )
      .sort(
        (a, b) =>
          (b.unlockedAt?.getTime() ?? 0) - (a.unlockedAt?.getTime() ?? 0),
      );

    return OkResult({
      achievements: achievementViews,
      unlockedCount,
      totalCount: definitions.length,
      byTier,
      byCategory,
      nextAchievement,
      recentlyUnlocked,
    });
  }

  async getAchievementView(
    userId: UserId,
    guildId: GuildId,
    achievementId: string,
  ): Promise<Result<AchievementView | null, AchievementError>> {
    const definition = getAchievementDefinition(achievementId);
    if (!definition) {
      return ErrResult(
        new AchievementErrorClass(
          "ACHIEVEMENT_NOT_FOUND",
          `Achievement "${achievementId}" not found.`,
        ),
      );
    }

    return OkResult(await buildAchievementView(userId, guildId, definition));
  }

  // -------------------------------------------------------------------------
  // Progress Tracking
  // -------------------------------------------------------------------------

  async updateProgress(
    userId: UserId,
    guildId: GuildId,
    conditionType: UnlockConditionType,
    value: number,
    metadata?: Record<string, unknown>,
  ): Promise<Result<void, AchievementError>> {
    const achievementIds = getAchievementsForConditionType(conditionType);
    const unlockedIds: string[] = [];

    for (const achievementId of achievementIds) {
      const definition = getAchievementDefinition(achievementId);
      if (!definition) continue;

      // Check if already unlocked
      const hasUnlocked = await achievementRepo.hasUnlocked(
        userId,
        guildId,
        achievementId,
      );
      if (hasUnlocked.isOk() && hasUnlocked.unwrap()) {
        continue;
      }

      const target = getTargetFromCondition(definition.condition);

      // Set progress
      const progressResult = await achievementRepo.setProgress(
        userId,
        guildId,
        achievementId,
        value,
        target,
      );

      if (progressResult.isOk() && progressResult.unwrap().completed) {
        // Unlock achievement
        const unlockResult = await achievementRepo.recordUnlock(
          userId,
          guildId,
          achievementId,
          metadata,
        );
        if (unlockResult.isOk()) {
          unlockedIds.push(achievementId);

          // Grant title if applicable
          if (definition.title) {
            await achievementRepo.addTitle(userId, guildId, {
              id: definition.title.titleId,
              name: definition.title.titleName,
              prefix: definition.title.titlePrefix,
              suffix: definition.title.titleSuffix,
              sourceAchievementId: achievementId,
              unlockedAt: new Date(),
            });
          }

          // Grant badge if applicable
          const badgeReward = definition.rewards.find(
            (r): r is import("./types").BadgeReward => r.type === "badge",
          );
          if (badgeReward) {
            await achievementRepo.addBadge(userId, guildId, {
              id: badgeReward.badgeId,
              name: badgeReward.badgeName,
              emoji: badgeReward.badgeEmoji,
              sourceAchievementId: achievementId,
              unlockedAt: new Date(),
              slot: 0, // Not displayed by default
            });
          }
        }
      }
    }

    return OkResult(undefined);
  }

  async incrementProgress(
    userId: UserId,
    guildId: GuildId,
    conditionType: UnlockConditionType,
    increment = 1,
    metadata?: Record<string, unknown>,
  ): Promise<Result<void, AchievementError>> {
    const achievementIds = getAchievementsForConditionType(conditionType);

    for (const achievementId of achievementIds) {
      const definition = getAchievementDefinition(achievementId);
      if (!definition) continue;

      // Check if already unlocked
      const hasUnlocked = await achievementRepo.hasUnlocked(
        userId,
        guildId,
        achievementId,
      );
      if (hasUnlocked.isOk() && hasUnlocked.unwrap()) {
        continue;
      }

      const target = getTargetFromCondition(definition.condition);

      // Get or create progress
      const progressResult = await achievementRepo.getOrCreateProgress(
        userId,
        guildId,
        achievementId,
        target,
      );

      if (progressResult.isErr()) continue;

      // Update progress
      const newProgressResult = await achievementRepo.updateProgress(
        userId,
        guildId,
        achievementId,
        increment,
        target,
      );

      if (newProgressResult.isOk() && newProgressResult.unwrap().completed) {
        // Unlock achievement
        await achievementRepo.recordUnlock(
          userId,
          guildId,
          achievementId,
          metadata,
        );

        // Grant title if applicable
        if (definition.title) {
          await achievementRepo.addTitle(userId, guildId, {
            id: definition.title.titleId,
            name: definition.title.titleName,
            prefix: definition.title.titlePrefix,
            suffix: definition.title.titleSuffix,
            sourceAchievementId: achievementId,
            unlockedAt: new Date(),
          });
        }

        // Grant badge if applicable
        const badgeReward = definition.rewards.find(
          (r): r is import("./types").BadgeReward => r.type === "badge",
        );
        if (badgeReward) {
          await achievementRepo.addBadge(userId, guildId, {
            id: badgeReward.badgeId,
            name: badgeReward.badgeName,
            emoji: badgeReward.badgeEmoji,
            sourceAchievementId: achievementId,
            unlockedAt: new Date(),
            slot: 0,
          });
        }
      }
    }

    return OkResult(undefined);
  }

  // -------------------------------------------------------------------------
  // Reward Claiming
  // -------------------------------------------------------------------------

  async claimRewards(
    input: ClaimAchievementRewardsInput,
  ): Promise<Result<ClaimAchievementRewardsResult, AchievementError>> {
    const { userId, guildId, achievementId } = input;

    // Get achievement definition
    const definition = getAchievementDefinition(achievementId);
    if (!definition) {
      return ErrResult(
        new AchievementErrorClass(
          "ACHIEVEMENT_NOT_FOUND",
          `Achievement "${achievementId}" not found.`,
        ),
      );
    }

    // Check if unlocked
    const hasUnlocked = await achievementRepo.hasUnlocked(
      userId,
      guildId,
      achievementId,
    );
    if (hasUnlocked.isErr() || !hasUnlocked.unwrap()) {
      return ErrResult(
        new AchievementErrorClass(
          "ACHIEVEMENT_NOT_UNLOCKED",
          "Achievement not yet unlocked.",
        ),
      );
    }

    // Get unlock record
    const unlockedResult = await achievementRepo.getUnlocked(userId, guildId);
    if (unlockedResult.isErr()) {
      return ErrResult(
        new AchievementErrorClass(
          "UPDATE_FAILED",
          "Failed to get unlock record.",
        ),
      );
    }

    const unlocked = unlockedResult
      .unwrap()
      .find((u) => u.achievementId === achievementId);
    if (!unlocked) {
      return ErrResult(
        new AchievementErrorClass(
          "ACHIEVEMENT_NOT_UNLOCKED",
          "Achievement unlock record not found.",
        ),
      );
    }

    // Check if already claimed
    if (unlocked.rewardsClaimed) {
      return ErrResult(
        new AchievementErrorClass(
          "REWARDS_ALREADY_CLAIMED",
          "Rewards already claimed for this achievement.",
        ),
      );
    }

    const correlationId = `achievement_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const appliedRewards: AppliedAchievementReward[] = [];

    // Apply rewards
    for (const reward of definition.rewards) {
      const applied = await this.applyReward(
        reward,
        userId,
        guildId,
        correlationId,
      );
      if (applied) {
        appliedRewards.push(applied);
      }
    }

    // Mark as claimed
    await achievementRepo.markRewardsClaimed(userId, guildId, achievementId);

    // Audit
    await economyAuditRepo.create({
      operationType: "xp_grant", // Using existing type
      actorId: userId,
      targetId: userId,
      guildId,
      source: "achievements",
      reason: `Claimed rewards for achievement: ${definition.name}`,
      metadata: {
        correlationId,
        achievementId,
        achievementName: definition.name,
        rewards: appliedRewards,
      },
    });

    return OkResult({
      achievementId,
      rewards: appliedRewards,
      correlationId,
    });
  }

  private async applyReward(
    reward: AchievementReward,
    userId: UserId,
    guildId: GuildId,
    correlationId: string,
  ): Promise<AppliedAchievementReward | null> {
    switch (reward.type) {
      case "xp": {
        const cappedAmount = Math.min(reward.amount, MAX_XP_REWARD);
        const xpResult = await progressionService.addXP({
          guildId,
          userId,
          sourceOp: "quest_complete",
          amount: cappedAmount,
          correlationId,
          metadata: { source: "achievement" },
        });

        if (xpResult.isOk()) {
          return {
            type: "xp",
            description: `${cappedAmount} XP`,
            amount: cappedAmount,
          };
        }
        return null;
      }

      case "currency": {
        const cappedAmount = Math.min(reward.amount, MAX_CURRENCY_REWARD);
        const currencyResult =
          await currencyMutationService.adjustCurrencyBalance(
            {
              actorId: userId,
              targetId: userId,
              guildId,
              currencyId: reward.currencyId,
              delta: cappedAmount,
              reason: "Achievement reward",
            },
            async () => true,
          );

        if (currencyResult.isOk()) {
          return {
            type: "currency",
            description: `${cappedAmount} ${reward.currencyId}`,
            amount: cappedAmount,
          };
        }
        return null;
      }

      case "title":
        // Title is already granted on unlock
        return {
          type: "title",
          description: `Título: "${reward.titleName}"`,
        };

      case "badge":
        // Badge is already granted on unlock
        return {
          type: "badge",
          description: `Insignia: ${reward.badgeEmoji} ${reward.badgeName}`,
        };

      case "item":
        // Items would need item mutation service
        return {
          type: "item",
          description: `${reward.quantity}x ${reward.itemId}`,
          amount: reward.quantity,
        };

      default:
        return null;
    }
  }

  // -------------------------------------------------------------------------
  // Title Management
  // -------------------------------------------------------------------------

  async getTitles(
    userId: UserId,
    guildId: GuildId,
  ): Promise<Result<TitleView[], AchievementError>> {
    const cosmeticsResult = await achievementRepo.getOrCreateCosmetics(
      userId,
      guildId,
    );
    if (cosmeticsResult.isErr()) {
      return ErrResult(cosmeticsResult.error);
    }

    const cosmetics = cosmeticsResult.unwrap();
    const titles: TitleView[] = [];

    for (const title of cosmetics.titles) {
      const sourceDef = getAchievementDefinition(title.sourceAchievementId);
      titles.push({
        id: title.id,
        name: title.name,
        prefix: title.prefix,
        suffix: title.suffix,
        sourceAchievementId: title.sourceAchievementId,
        sourceAchievementName: sourceDef?.name ?? "Logro desconocido",
        isEquipped: cosmetics.equippedTitle?.titleId === title.id,
      });
    }

    return OkResult(titles);
  }

  async equipTitle(
    input: EquipTitleInput,
  ): Promise<Result<EquippedTitle, AchievementError>> {
    return achievementRepo.equipTitle(
      input.userId,
      input.guildId,
      input.titleId,
    );
  }

  async unequipTitle(
    userId: UserId,
    guildId: GuildId,
  ): Promise<Result<boolean, AchievementError>> {
    return achievementRepo.unequipTitle(userId, guildId);
  }

  async getEquippedTitle(
    userId: UserId,
    guildId: GuildId,
  ): Promise<Result<EquippedTitle | null, AchievementError>> {
    const cosmeticsResult = await achievementRepo.getOrCreateCosmetics(
      userId,
      guildId,
    );
    if (cosmeticsResult.isErr()) {
      return ErrResult(cosmeticsResult.error);
    }

    return OkResult(cosmeticsResult.unwrap().equippedTitle ?? null);
  }

  // -------------------------------------------------------------------------
  // Badge Management
  // -------------------------------------------------------------------------

  async setBadgeSlot(
    userId: UserId,
    guildId: GuildId,
    slot: 1 | 2 | 3,
    badgeId: string | null,
  ): Promise<Result<boolean, AchievementError>> {
    // Verify badge ownership if setting
    if (badgeId) {
      const cosmeticsResult = await achievementRepo.getOrCreateCosmetics(
        userId,
        guildId,
      );
      if (cosmeticsResult.isErr()) {
        return ErrResult(cosmeticsResult.error);
      }

      const hasBadge = cosmeticsResult
        .unwrap()
        .badges.some((b) => b.id === badgeId);
      if (!hasBadge) {
        return ErrResult(
          new AchievementErrorClass(
            "BADGE_NOT_OWNED",
            "You don't own this badge.",
          ),
        );
      }
    }

    return achievementRepo.setBadgeSlot(userId, guildId, slot, badgeId);
  }

  async getEquippedBadges(
    userId: UserId,
    guildId: GuildId,
  ): Promise<Result<(UserBadge | null)[], AchievementError>> {
    const cosmeticsResult = await achievementRepo.getOrCreateCosmetics(
      userId,
      guildId,
    );
    if (cosmeticsResult.isErr()) {
      return ErrResult(cosmeticsResult.error);
    }

    const cosmetics = cosmeticsResult.unwrap();
    const equipped: (UserBadge | null)[] = [null, null, null];

    for (let i = 0; i < 3; i++) {
      const badgeId = cosmetics.badgeSlots[i];
      if (badgeId) {
        const badge = cosmetics.badges.find((b) => b.id === badgeId);
        equipped[i] = badge ?? null;
      }
    }

    return OkResult(equipped);
  }

  // -------------------------------------------------------------------------
  // Profile Cosmetics
  // -------------------------------------------------------------------------

  async getProfileCosmetics(
    userId: UserId,
    guildId: GuildId,
  ): Promise<Result<ProfileCosmetics, AchievementError>> {
    return achievementRepo.getOrCreateCosmetics(userId, guildId);
  }

  // -------------------------------------------------------------------------
  // Audit-based Evaluation
  // -------------------------------------------------------------------------

  async evaluateFromAudit(
    userId: UserId,
    guildId: GuildId,
    operationType: string,
    metadata: Record<string, unknown>,
  ): Promise<Result<string[], AchievementError>> {
    const achievements = await achievementRepo.getAchievementsForAudit(
      userId,
      guildId,
      operationType,
      metadata,
    );
    return OkResult(achievements);
  }
}

/** Build achievement view with progress. */
async function buildAchievementView(
  userId: UserId,
  guildId: GuildId,
  definition: AchievementDefinition,
): Promise<AchievementView> {
  const [unlockedResult, progressResult] = await Promise.all([
    achievementRepo.hasUnlocked(userId, guildId, definition.id),
    achievementRepo.getOrCreateProgress(
      userId,
      guildId,
      definition.id,
      getTargetFromCondition(definition.condition),
    ),
  ]);

  const isUnlocked = unlockedResult.isOk() ? unlockedResult.unwrap() : false;
  const progress = progressResult.isOk() ? progressResult.unwrap() : null;

  let unlockedAt: Date | undefined;
  let rewardsClaimed = false;

  if (isUnlocked) {
    const unlockedResult = await achievementRepo.getUnlocked(userId, guildId);
    if (unlockedResult.isOk()) {
      const unlocked = unlockedResult
        .unwrap()
        .find((u) => u.achievementId === definition.id);
      if (unlocked) {
        unlockedAt = unlocked.unlockedAt;
        rewardsClaimed = unlocked.rewardsClaimed;
      }
    }
  }

  const progressView: AchievementProgressView | undefined = progress
    ? {
        current: progress.progress,
        target: progress.target,
        percent: Math.min(
          100,
          Math.round((progress.progress / progress.target) * 100),
        ),
        completed: progress.completed,
      }
    : undefined;

  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    tier: definition.tier,
    category: definition.category,
    tierEmoji: TIER_DISPLAY[definition.tier].emoji,
    rewards: definition.rewards,
    title: definition.title,
    progress: progressView,
    hidden: definition.hidden ?? false,
    isUnlocked,
    unlockedAt,
    rewardsClaimed,
  };
}

/** Get target value from condition. */
function getTargetFromCondition(
  condition: AchievementDefinition["condition"],
): number {
  switch (condition.type) {
    case "streak_milestone":
      return condition.days;
    case "level_milestone":
      return condition.level;
    case "craft_count":
      return condition.count;
    case "trivia_wins":
      return condition.count;
    case "coinflip_streak":
      return condition.consecutiveWins;
    case "rob_success":
      return condition.totalAmount;
    case "store_purchases":
      return condition.count;
    case "quest_completions":
      return condition.count;
    case "currency_held":
      return condition.amount;
    case "items_collected":
      return condition.uniqueItems;
    case "votes_cast":
      return condition.count;
    case "login_streak":
      return condition.days;
    case "special":
      return 1;
    default:
      return 0;
  }
}

/** Get relevant achievement IDs for a condition type. */
function getAchievementsForConditionType(
  conditionType: UnlockConditionType,
): string[] {
  return getAllAchievementDefinitions()
    .filter((a) => a.condition.type === conditionType)
    .map((a) => a.id);
}

/** Singleton instance. */
export const achievementService = new AchievementService();
