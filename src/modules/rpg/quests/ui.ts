import { Embed } from "seyfert";
import type { QuestBrowseView } from "./types";

function progressBar(percent: number, size: number = 10): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round((clamped / 100) * size);
  return `${"█".repeat(filled)}${"░".repeat(size - filled)}`;
}

export function buildQuestBoardEmbed(
  board: QuestBrowseView,
  username: string,
): Embed {
  const embed = new Embed()
    .setTitle("📜 Quests")
    .setColor(0x2f3136)
    .setDescription(`Active and available quests for **${username}**.`);

  if (board.active.length === 0) {
    embed.addFields({
      name: "🧭 Active",
      value: "No active quests. Use **Browse** to accept one.",
      inline: false,
    });
  } else {
    const activeLines = board.active.map((entry) => {
      const doneSteps = entry.steps.filter((step) => step.done).length;
      const percent =
        entry.steps.length > 0 ? (doneSteps / entry.steps.length) * 100 : 0;
      const status = entry.completed ? "🎁 Ready to claim" : "🔄 In progress";
      return `${entry.quest.icon ?? "📌"} **${entry.quest.title}**\n${progressBar(percent)} ${Math.round(percent)}% • ${status}`;
    });

    embed.addFields({
      name: "🧭 Active",
      value: activeLines.join("\n\n").slice(0, 1024),
      inline: false,
    });
  }

  if (board.available.length === 0) {
    embed.addFields({
      name: "🗂️ Available",
      value: "No quests available right now.",
      inline: false,
    });
  } else {
    const availableLines = board.available
      .slice(0, 8)
      .map((quest) => `${quest.icon ?? "📌"} **${quest.title}** (${quest.difficulty})`)
      .join("\n");

    embed.addFields({
      name: "🗂️ Available",
      value: availableLines,
      inline: false,
    });
  }

  return embed;
}

export function buildQuestDetailsEmbed(board: QuestBrowseView): Embed {
  const embed = new Embed()
    .setTitle("📋 Quest Details")
    .setColor(0x5865f2)
    .setDescription("Progress per active quest step.");

  if (board.active.length === 0) {
    embed.setDescription("No active quests.");
    return embed;
  }

  for (const entry of board.active.slice(0, 5)) {
    const stepLines = entry.steps
      .map((step) => `${step.done ? "✅" : "▫️"} ${step.label}`)
      .join("\n");

    embed.addFields({
      name: `${entry.quest.icon ?? "📌"} ${entry.quest.title}`,
      value: stepLines.slice(0, 1024),
      inline: false,
    });
  }

  return embed;
}

export function buildQuestActionErrorEmbed(message: string): Embed {
  return new Embed()
    .setTitle("⚠️ Quest Error")
    .setColor(0xed4245)
    .setDescription(message);
}

export function buildQuestActionSuccessEmbed(message: string): Embed {
  return new Embed()
    .setTitle("✅ Quest Update")
    .setColor(0x57f287)
    .setDescription(message);
}
