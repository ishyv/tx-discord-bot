/**
 * Quest UI Components.
 *
 * Purpose: Build embeds for the Quest Board.
 * Context: Used by /quests and /quest commands.
 * Dependencies: Discord.js embeds.
 */

import { Embed } from "seyfert";
import type {
  QuestBoardView,
  QuestView,
  QuestRotationType,
  QuestDifficulty,
  RequirementView,
} from "./types";

/** Difficulty emoji mapping. */
const DIFFICULTY_EMOJI: Record<QuestDifficulty, string> = {
  easy: "🟢",
  medium: "🔵",
  hard: "🟠",
  expert: "🔴",
  legendary: "🟣",
};

/** Category emoji mapping. */
const CATEGORY_EMOJI: Record<string, string> = {
  general: "📋",
  economy: "💰",
  social: "👥",
  minigame: "🎮",
  crafting: "🔨",
  voting: "🗳️",
  exploration: "🗺️",
};

/** Build the main quest board embed. */
export function buildQuestBoardEmbed(
  board: QuestBoardView,
  username: string,
  activeTab: QuestRotationType = "daily",
): Embed {
  const embed = new Embed()
    .setTitle("📜 Quest Board")
    .setDescription(
      `Welcome to the Quest Board, **${username}**!\n\nComplete quests to earn exclusive rewards.`,
    )
    .setColor(0xf39c12)
    .setFooter({
      text: `Tokens: ${board.questTokens} | Completed: ${board.totalCompleted}`,
    });

  // Add tab content based on active tab
  switch (activeTab) {
    case "daily":
      embed.addFields(buildRotationFields(board.daily, "Daily", "⏰"));
      break;
    case "weekly":
      embed.addFields(buildRotationFields(board.weekly, "Weekly", "📅"));
      break;
    case "featured":
      if (board.featured) {
        embed.addFields(buildQuestDetailFields(board.featured, true));
      } else {
        embed.addFields({
          name: "⭐ Featured Quest",
          value: "No featured quest available currently.",
          inline: false,
        });
      }
      break;
  }

  // Add featured preview if not on featured tab
  if (activeTab !== "featured" && board.featured) {
    const featuredStatus = board.featured.progress?.isCompleted
      ? "✅ Completed"
      : board.featured.progress?.percentComplete
        ? `🔄 ${board.featured.progress.percentComplete}%`
        : "🆕 New";

    embed.addFields({
      name: "⭐ Featured Quest (Preview)",
      value: `${DIFFICULTY_EMOJI[board.featured.difficulty]} **${board.featured.name}**\n${featuredStatus} | Multiplicador: **${board.featured.rewardMultiplier}x**`,
      inline: false,
    });
  }

  return embed;
}

/** Build rotation fields for embed. */
function buildRotationFields(
  rotation: QuestBoardView["daily"] | QuestBoardView["weekly"],
  title: string,
  emoji: string,
): { name: string; value: string; inline: boolean }[] {
  const fields: { name: string; value: string; inline: boolean }[] = [];

  if (!rotation.isActive || rotation.quests.length === 0) {
    fields.push({
      name: `${emoji} ${title} Quests`,
      value: "No quests available currently.",
      inline: false,
    });
    return fields;
  }

  const timeRemaining = formatTimeRemaining(rotation.expiresAt);

  fields.push({
    name: `${emoji} ${title} Quests (Expires in: ${timeRemaining})`,
    value: rotation.quests.map((q) => formatQuestLine(q)).join("\n"),
    inline: false,
  });

  return fields;
}

/** Format a single quest line for list display. */
function formatQuestLine(quest: QuestView): string {
  const emoji = DIFFICULTY_EMOJI[quest.difficulty];
  const category = CATEGORY_EMOJI[quest.category] ?? "📋";

  let status: string;
  if (quest.progress?.isClaimed) {
    status = "✅";
  } else if (quest.progress?.isCompleted) {
    status = "🎁";
  } else if (quest.progress?.percentComplete) {
    status = `🔄 ${quest.progress.percentComplete}%`;
  } else {
    status = "🆕";
  }

  const completions =
    quest.progress && quest.progress.maxCompletions > 1
      ? ` (${quest.progress.completions}/${quest.progress.maxCompletions})`
      : "";

  return `${emoji} ${category} **${quest.name}** ${status}${completions}`;
}

/** Build detailed quest fields. */
function buildQuestDetailFields(
  quest: QuestView,
  isFeatured: boolean = false,
): { name: string; value: string; inline: boolean }[] {
  const fields: { name: string; value: string; inline: boolean }[] = [];

  const featuredText = isFeatured ? "⭐ FEATURED | " : "";
  const multiplierText =
    quest.rewardMultiplier > 1
      ? ` (**${quest.rewardMultiplier}x** rewards)`
      : "";

  fields.push({
    name: `${featuredText}${DIFFICULTY_EMOJI[quest.difficulty]} ${quest.name}${multiplierText}`,
    value: quest.description,
    inline: false,
  });

  // Requirements
  const reqLines = quest.requirements.map((r) => formatRequirement(r));
  fields.push({
    name: "📋 Requirements",
    value: reqLines.join("\n") || "None",
    inline: false,
  });

  // Rewards
  const rewardLines = quest.rewards.map((r) => {
    switch (r.type) {
      case "currency":
        return `💰 ${r.amount} ${r.currencyId}`;
      case "xp":
        return `✨ ${r.amount} XP`;
      case "item":
        return `📦 ${r.quantity}x ${r.itemId}`;
      case "quest_token":
        return `🎫 ${r.amount} Quest Tokens`;
      default:
        return `❓ ${JSON.stringify(r)}`;
    }
  });
  fields.push({
    name: "🎁 Rewards",
    value: rewardLines.join("\n"),
    inline: false,
  });

  // Progress
  if (quest.progress) {
    const progressText = quest.progress.isClaimed
      ? "✅ Completed and claimed"
      : quest.progress.isCompleted
        ? "🎁 Ready to claim!"
        : `🔄 Progress: ${quest.progress.percentComplete}%`;

    fields.push({
      name: "📊 Status",
      value: progressText,
      inline: false,
    });
  }

  // Expiration
  fields.push({
    name: "⏰ Expires",
    value: `<t:${Math.floor(quest.expiresAt.getTime() / 1000)}:R>`,
    inline: true,
  });

  return fields;
}

/** Format requirement with progress. */
function formatRequirement(req: RequirementView): string {
  const status = req.completed ? "✅" : "⬜";
  const progress =
    req.current > 0 && !req.completed ? ` (${req.current}/${req.target})` : "";
  return `${status} ${req.description}${progress}`;
}

/** Format time remaining. */
function formatTimeRemaining(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff <= 0) return "Expired";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  return `${hours}h ${minutes}m`;
}

/** Build quest detail embed. */
export function buildQuestDetailEmbed(quest: QuestView): Embed {
  const embed = new Embed()
    .setTitle(`${DIFFICULTY_EMOJI[quest.difficulty]} ${quest.name}`)
    .setDescription(quest.description)
    .setColor(getDifficultyColor(quest.difficulty));

  if (quest.isFeatured) {
    embed.setTitle(
      `⭐ ${embed.data.title} | **${quest.rewardMultiplier}x REWARDS**`,
    );
  }

  // Add all fields
  for (const field of buildQuestDetailFields(quest, quest.isFeatured)) {
    embed.addFields(field);
  }

  return embed;
}

/** Get color based on difficulty. */
function getDifficultyColor(difficulty: QuestDifficulty): number {
  switch (difficulty) {
    case "easy":
      return 0x2ecc71; // Green
    case "medium":
      return 0x3498db; // Blue
    case "hard":
      return 0xe67e22; // Orange
    case "expert":
      return 0xe74c3c; // Red
    case "legendary":
      return 0x9b59b6; // Purple
    default:
      return 0x95a5a6; // Gray
  }
}

/** Build claim result embed. */
export function buildClaimResultEmbed(
  questName: string,
  rewards: { type: string; description: string; amount: number }[],
  correlationId: string,
): Embed {
  const embed = new Embed()
    .setTitle("🎉 Rewards Claimed!")
    .setDescription(`You have completed the quest **${questName}** and received:`)
    .setColor(0x2ecc71)
    .setFooter({ text: `ID: ${correlationId}` });

  const rewardLines = rewards.map((r) => `• ${r.description}`);
  embed.addFields({
    name: "🎁 Rewards",
    value: rewardLines.join("\n") || "None",
    inline: false,
  });

  return embed;
}

/** Build error embed. */
export function buildQuestErrorEmbed(message: string): Embed {
  return new Embed()
    .setTitle("❌ Error")
    .setDescription(message)
    .setColor(0xe74c3c);
}

/** Build success embed. */
export function buildQuestSuccessEmbed(title: string, message: string): Embed {
  return new Embed()
    .setTitle(`✅ ${title}`)
    .setDescription(message)
    .setColor(0x2ecc71);
}
