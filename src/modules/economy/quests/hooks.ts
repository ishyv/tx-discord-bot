/**
 * Quest Integration Hooks.
 *
 * Purpose: Hook into existing services to track quest progress automatically.
 * Context: Called by work, crafting, minigames, voting, and other services.
 * Dependencies: QuestService, Event Bus.
 */

import type { UserId, GuildId } from "@/db/types";
import { OkResult, type Result } from "@/utils/result";
import { questService, questRepo } from "./";
import type { QuestRequirementType, QuestProgress } from "./types";

/** Hook context for progress updates. */
export interface QuestHookContext {
  readonly userId: UserId;
  readonly guildId: GuildId;
  readonly requirementType: QuestRequirementType;
  readonly metadata: Record<string, unknown>;
}

/** Track quest progress from external events.
 * This should be called by other services when actions that might complete quest requirements occur.
 */
export async function trackQuestProgress(
  ctx: QuestHookContext,
): Promise<Result<QuestProgress[], Error>> {
  const { userId, guildId, requirementType, metadata } = ctx;

  // Get current rotations
  const [dailyRotation, weeklyRotation, featuredRotation] = await Promise.all([
    questRepo.getCurrentRotation(guildId, "daily"),
    questRepo.getCurrentRotation(guildId, "weekly"),
    questRepo.getCurrentRotation(guildId, "featured"),
  ]);

  const rotations = [
    dailyRotation.unwrap(),
    weeklyRotation.unwrap(),
    featuredRotation.unwrap(),
  ].filter(Boolean);

  const updatedProgress: QuestProgress[] = [];

  for (const rotation of rotations) {
    if (!rotation) continue;

    for (const questId of rotation.questIds) {
      // Check if already completed
      const progressResult = await questRepo.getProgress(
        userId,
        rotation.id,
        questId,
      );
      if (progressResult.isOk() && progressResult.unwrap()?.completed) {
        continue; // Already completed, skip
      }

      // Try to update progress
      const updateResult = await questService.updateProgress({
        userId,
        guildId,
        rotationId: rotation.id,
        questId,
        requirementType,
        increment: 1,
        metadata,
      });

      if (updateResult.isOk()) {
        const progress = updateResult.unwrap();
        updatedProgress.push(progress);

        // Check if quest is now complete
        const templateResult = await questRepo.getTemplate(guildId, questId);
        if (templateResult.isOk() && templateResult.unwrap()) {
          const template = templateResult.unwrap()!;

          // Check if all requirements are met
          const allMet = template.requirements.every((req, idx) => {
            const target = getRequirementTarget(req);
            return (progress.requirementProgress[idx] ?? 0) >= target;
          });

          if (allMet && !progress.completed) {
            // Mark as complete
            await questService.checkAndCompleteQuest(
              userId,
              rotation.id,
              questId,
            );
          }
        }
      }
    }
  }

  return OkResult(updatedProgress);
}

/** Get requirement target value. */
function getRequirementTarget(req: {
  type: string;
  count?: number;
  amount?: number;
}): number {
  switch (req.type) {
    case "do_command":
      return (req.count as number) ?? 0;
    case "spend_currency":
      return (req.amount as number) ?? 0;
    case "craft_recipe":
      return (req.count as number) ?? 0;
    case "win_minigame":
      return (req.count as number) ?? 0;
    case "vote_cast":
      return (req.count as number) ?? 0;
    default:
      return 0;
  }
}

/** Helper to track command usage. */
export async function trackCommandUsage(
  userId: UserId,
  guildId: GuildId,
  command: string,
): Promise<Result<QuestProgress[], Error>> {
  return trackQuestProgress({
    userId,
    guildId,
    requirementType: "do_command",
    metadata: { command },
  });
}

/** Helper to track currency spent. */
export async function trackCurrencySpent(
  userId: UserId,
  guildId: GuildId,
  currencyId: string,
  amount: number,
): Promise<Result<QuestProgress[], Error>> {
  return trackQuestProgress({
    userId,
    guildId,
    requirementType: "spend_currency",
    metadata: { currencyId, amount },
  });
}

/** Helper to track crafting. */
export async function trackCrafting(
  userId: UserId,
  guildId: GuildId,
  recipeId: string,
  count: number = 1,
): Promise<Result<QuestProgress[], Error>> {
  return trackQuestProgress({
    userId,
    guildId,
    requirementType: "craft_recipe",
    metadata: { recipeId, count },
  });
}

/** Helper to track minigame wins. */
export async function trackMinigameWin(
  userId: UserId,
  guildId: GuildId,
  game: "coinflip" | "trivia",
): Promise<Result<QuestProgress[], Error>> {
  return trackQuestProgress({
    userId,
    guildId,
    requirementType: "win_minigame",
    metadata: { game },
  });
}

/** Helper to track votes cast. */
export async function trackVoteCast(
  userId: UserId,
  guildId: GuildId,
  voteType: "love" | "hate",
): Promise<Result<QuestProgress[], Error>> {
  return trackQuestProgress({
    userId,
    guildId,
    requirementType: "vote_cast",
    metadata: { voteType },
  });
}
