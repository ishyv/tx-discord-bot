/**
 * Quest Command - Unified Quest Management.
 *
 * Purpose: View quest board, manage individual quests, check progress, and claim rewards.
 * Subcommands: board, view, claim, progress, list.
 */

import {
  Command,
  Declare,
  SubCommand,
  type CommandContext,
  Options,
  createStringOption,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
  questService,
  questRepo,
  questRotationService,
  type QuestRotationType,
} from "@/modules/economy/quests";
import {
  buildQuestDetailEmbed,
  buildClaimResultEmbed,
  buildQuestErrorEmbed,
  buildQuestSuccessEmbed,
  buildQuestBoardEmbed,
} from "@/modules/economy/quests/ui";

const boardOptions = {
  tab: createStringOption({
    description: "Tab to display (daily, weekly, featured)",
    choices: [
      { name: "📅 Daily", value: "daily" },
      { name: "📆 Weekly", value: "weekly" },
      { name: "⭐ Featured", value: "featured" },
    ],
    required: false,
  }),
};

@Declare({
  name: "quest",
  description: "📜 Manage your quests and view the quest board",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 5000,
  uses: { default: 5 },
})
@Options(boardOptions)
export default class QuestCommand extends Command {
  // Default: show quest board
  async run(ctx: CommandContext<typeof boardOptions>) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;

    if (!guildId) {
      await ctx.write({
        embeds: [
          buildQuestErrorEmbed(
            "This command can only be used in a server.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Ensure rotations exist
    const rotationStatus =
      await questRotationService.ensureCurrentRotations(guildId);
    if (rotationStatus.isErr()) {
      await ctx.write({
        embeds: [
          buildQuestErrorEmbed(
            `Error loading quests: ${rotationStatus.error.message}`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get quest board
    const boardResult = await questService.getQuestBoard(guildId, userId);
    if (boardResult.isErr()) {
      await ctx.write({
        embeds: [
          buildQuestErrorEmbed(
            `Error loading quests: ${boardResult.error.message}`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const board = boardResult.unwrap();
    const activeTab = (ctx.options.tab as QuestRotationType) ?? "daily";

    // Build embed
    const embed = buildQuestBoardEmbed(board, ctx.author.username, activeTab);

    await ctx.write({ embeds: [embed] });
  }
}

// Subcommand: board (explicit access to quest board)
@Declare({
  name: "board",
  description: "Open the interactive Quest Board",
})
@Options(boardOptions)
export class QuestBoardSubCommand extends SubCommand {
  async run(ctx: CommandContext<typeof boardOptions>) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;

    if (!guildId) {
      await ctx.write({
        embeds: [
          buildQuestErrorEmbed(
            "This command can only be used in a server.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Ensure rotations exist
    const rotationStatus =
      await questRotationService.ensureCurrentRotations(guildId);
    if (rotationStatus.isErr()) {
      await ctx.write({
        embeds: [
          buildQuestErrorEmbed(
            `Error loading quests: ${rotationStatus.error.message}`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get quest board
    const boardResult = await questService.getQuestBoard(guildId, userId);
    if (boardResult.isErr()) {
      await ctx.write({
        embeds: [
          buildQuestErrorEmbed(
            `Error loading quests: ${boardResult.error.message}`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const board = boardResult.unwrap();
    const activeTab = (ctx.options.tab as QuestRotationType) ?? "daily";

    // Build embed
    const embed = buildQuestBoardEmbed(board, ctx.author.username, activeTab);

    await ctx.write({ embeds: [embed] });
  }
}

// Subcommand: view
const viewOptions = {
  id: createStringOption({
    description: "ID of the quest to view",
    required: true,
  }),
};

@Declare({
  name: "view",
  description: "View details of a specific quest",
})
@Options(viewOptions)
export class QuestViewSubCommand extends SubCommand {
  async run(ctx: CommandContext<typeof viewOptions>) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;
    const questId = ctx.options.id;

    if (!guildId) {
      await ctx.write({
        embeds: [
          buildQuestErrorEmbed(
            "This command can only be used in a server.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Find the quest in current rotations
    const [dailyRotation, weeklyRotation, featuredRotation] = await Promise.all(
      [
        questRepo.getCurrentRotation(guildId, "daily"),
        questRepo.getCurrentRotation(guildId, "weekly"),
        questRepo.getCurrentRotation(guildId, "featured"),
      ],
    );

    let rotationId: string | undefined;
    for (const rotation of [
      dailyRotation.unwrap(),
      weeklyRotation.unwrap(),
      featuredRotation.unwrap(),
    ]) {
      if (rotation?.questIds.includes(questId)) {
        rotationId = rotation.id;
        break;
      }
    }

    if (!rotationId) {
      // Try to get the template anyway for info
      const templateResult = await questService.getTemplate(guildId, questId);
      if (templateResult.isOk() && templateResult.unwrap()) {
        const template = templateResult.unwrap()!;
        await ctx.write({
          embeds: [
            buildQuestErrorEmbed(
              `The quest "${template.name}" is not available in the current rotation.`,
            ),
          ],
        });
        return;
      }

      await ctx.write({
        embeds: [buildQuestErrorEmbed("Quest not found or not available.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get quest view with progress
    const questViewResult = await questService.getQuestView(
      guildId,
      userId,
      rotationId,
      questId,
    );
    if (questViewResult.isErr()) {
      await ctx.write({
        embeds: [
          buildQuestErrorEmbed(`Error: ${questViewResult.error.message}`),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const quest = questViewResult.unwrap();
    if (!quest) {
      await ctx.write({
        embeds: [buildQuestErrorEmbed("Quest not found.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = buildQuestDetailEmbed(quest);
    await ctx.write({ embeds: [embed] });
  }
}

// Subcommand: claim
const claimOptions = {
  id: createStringOption({
    description: "ID of the quest to claim",
    required: true,
  }),
};

@Declare({
  name: "claim",
  description: "Claim rewards from a completed quest",
})
@Options(claimOptions)
export class QuestClaimSubCommand extends SubCommand {
  async run(ctx: CommandContext<typeof claimOptions>) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;
    const questId = ctx.options.id;

    if (!guildId) {
      await ctx.write({
        embeds: [
          buildQuestErrorEmbed(
            "This command can only be used in a server.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Find the quest in current rotations
    const [dailyRotation, weeklyRotation, featuredRotation] = await Promise.all(
      [
        questRepo.getCurrentRotation(guildId, "daily"),
        questRepo.getCurrentRotation(guildId, "weekly"),
        questRepo.getCurrentRotation(guildId, "featured"),
      ],
    );

    let rotationId: string | undefined;
    for (const rotation of [
      dailyRotation.unwrap(),
      weeklyRotation.unwrap(),
      featuredRotation.unwrap(),
    ]) {
      if (rotation?.questIds.includes(questId)) {
        rotationId = rotation.id;
        break;
      }
    }

    if (!rotationId) {
      await ctx.write({
        embeds: [
          buildQuestErrorEmbed(
            "This quest is not available in the current rotation.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Claim rewards
    const claimResult = await questService.claimRewards({
      guildId,
      userId,
      rotationId,
      questId,
    });

    if (claimResult.isErr()) {
      const error = claimResult.error;
      let message = error.message;

      // Provide helpful messages for common errors
      if (error.code === "QUEST_NOT_COMPLETED") {
        message = "You haven't completed all the requirements for this quest yet.";
      } else if (error.code === "REWARDS_ALREADY_CLAIMED") {
        message = "You've already claimed the rewards for this quest.";
      }

      await ctx.write({
        embeds: [buildQuestErrorEmbed(message)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const result = claimResult.unwrap();

    // Get quest name
    const templateResult = await questService.getTemplate(guildId, questId);
    const questName =
      templateResult.isOk() && templateResult.unwrap()
        ? templateResult.unwrap()!.name
        : questId;

    const embed = buildClaimResultEmbed(
      questName,
      result.rewards,
      result.correlationId,
    );
    await ctx.write({ embeds: [embed] });
  }
}

// Subcommand: progress
@Declare({
  name: "progress",
  description: "View your overall quest progress",
})
export class QuestProgressSubCommand extends SubCommand {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;

    if (!guildId) {
      await ctx.write({
        embeds: [
          buildQuestErrorEmbed(
            "This command can only be used in a server.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const statsResult = await questService.getStats(userId, guildId);
    if (statsResult.isErr()) {
      await ctx.write({
        embeds: [buildQuestErrorEmbed(`Error: ${statsResult.error.message}`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const stats = statsResult.unwrap();
    const boardResult = await questService.getQuestBoard(guildId, userId);

    let dailyProgress = 0;
    let weeklyProgress = 0;

    if (boardResult.isOk()) {
      const board = boardResult.unwrap();
      dailyProgress = board.daily.quests.filter(
        (q) => q.progress?.isCompleted && !q.progress?.isClaimed,
      ).length;
      weeklyProgress = board.weekly.quests.filter(
        (q) => q.progress?.isCompleted && !q.progress?.isClaimed,
      ).length;
    }

    const { Embed } = await import("seyfert");
    const embed = new Embed()
      .setTitle("📊 Your Quest Progress")
      .setColor(0x3498db)
      .addFields(
        {
          name: "🎯 Total Completed",
          value: stats.totalCompleted.toString(),
          inline: true,
        },
        {
          name: "📅 Daily Completed",
          value: stats.dailyCompleted.toString(),
          inline: true,
        },
        {
          name: "📆 Weekly Completed",
          value: stats.weeklyCompleted.toString(),
          inline: true,
        },
        {
          name: "⭐ Featured Completed",
          value: stats.featuredCompleted.toString(),
          inline: true,
        },
        {
          name: "🎫 Quest Tokens",
          value: stats.questTokens.toString(),
          inline: true,
        },
        {
          name: "🎁 Daily Ready to Claim",
          value: dailyProgress.toString(),
          inline: true,
        },
        {
          name: "🎁 Weekly Ready to Claim",
          value: weeklyProgress.toString(),
          inline: true,
        },
      );

    await ctx.write({ embeds: [embed] });
  }
}

// Subcommand: list
@Declare({
  name: "list",
  description: "List all available quests",
})
export class QuestListSubCommand extends SubCommand {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId;

    if (!guildId) {
      await ctx.write({
        embeds: [
          buildQuestErrorEmbed(
            "This command can only be used in a server.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const templatesResult = await questService.listTemplates(guildId);
    if (templatesResult.isErr()) {
      await ctx.write({
        embeds: [
          buildQuestErrorEmbed(`Error: ${templatesResult.error.message}`),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const templates = templatesResult.unwrap();

    if (templates.length === 0) {
      await ctx.write({
        embeds: [
          buildQuestSuccessEmbed(
            "No Quests",
            "No quests are configured in this server. Contact an administrator.",
          ),
        ],
      });
      return;
    }

    // Group by difficulty
    const byDifficulty = new Map<string, typeof templates>();
    for (const template of templates) {
      const list = byDifficulty.get(template.difficulty) ?? [];
      list.push(template);
      byDifficulty.set(template.difficulty, list);
    }

    const { Embed } = await import("seyfert");
    const embed = new Embed()
      .setTitle("📜 Available Quests")
      .setDescription(
        `There are ${templates.length} quests configured in this server.`,
      )
      .setColor(0xf39c12);

    const difficultyOrder = ["easy", "medium", "hard", "expert", "legendary"];
    const difficultyNames: Record<string, string> = {
      easy: "🟢 Easy",
      medium: "🔵 Medium",
      hard: "🟠 Hard",
      expert: "🔴 Expert",
      legendary: "🟣 Legendary",
    };

    for (const diff of difficultyOrder) {
      const list = byDifficulty.get(diff);
      if (list && list.length > 0) {
        const lines = list.map(
          (t) => `• **${t.name}** - ${t.description.slice(0, 60)}...`,
        );
        embed.addFields({
          name: difficultyNames[diff],
          value: lines.join("\n").slice(0, 1024),
          inline: false,
        });
      }
    }

    await ctx.write({ embeds: [embed] });
  }
}
