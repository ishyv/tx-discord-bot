/**
 * Achievements Command.
 *
 * Purpose: Display achievement board and manage achievements.
 * Subcommands: view, claim, progress, category.
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
  achievementService,
  buildAchievementBoardEmbed,
  buildAchievementDetailEmbed,
  buildCategoryAchievementsEmbed,
  buildRewardClaimEmbed,
  buildAchievementErrorEmbed,
  CATEGORY_DISPLAY,
} from "@/modules/economy/achievements";

@Declare({
  name: "achievements",
  description: "🏆 Manage your achievements and rewards",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 5000,
  uses: { default: 5 },
})
export default class AchievementsCommand extends Command {
  // Default: show achievement board
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;

    if (!guildId) {
      await ctx.write({
        embeds: [
          buildAchievementErrorEmbed(
            "This command can only be used in a server.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const boardResult = await achievementService.getAchievementBoard(
      userId,
      guildId,
    );
    if (boardResult.isErr()) {
      await ctx.write({
        embeds: [
          buildAchievementErrorEmbed(`Error: ${boardResult.error.message}`),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = buildAchievementBoardEmbed(
      boardResult.unwrap(),
      ctx.author.username,
    );
    await ctx.write({ embeds: [embed] });
  }
}

// Subcommand: view
const viewOptions = {
  id: createStringOption({
    description: "ID of the achievement to view",
    required: true,
  }),
};

@Declare({
  name: "view",
  description: "View details of a specific achievement",
})
@Options(viewOptions)
export class AchievementsViewSubCommand extends SubCommand {
  async run(ctx: CommandContext<typeof viewOptions>) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;
    const achievementId = ctx.options.id;

    if (!guildId) {
      await ctx.write({
        embeds: [
          buildAchievementErrorEmbed(
            "This command can only be used in a server.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const achievementResult = await achievementService.getAchievementView(
      userId,
      guildId,
      achievementId,
    );

    if (achievementResult.isErr()) {
      await ctx.write({
        embeds: [
          buildAchievementErrorEmbed(
            `Error: ${achievementResult.error.message}`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const achievement = achievementResult.unwrap();
    if (!achievement) {
      await ctx.write({
        embeds: [buildAchievementErrorEmbed("Achievement not found.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = buildAchievementDetailEmbed(achievement);
    await ctx.write({ embeds: [embed] });
  }
}

// Subcommand: claim
const claimOptions = {
  id: createStringOption({
    description: "ID of the achievement to claim rewards from",
    required: true,
  }),
};

@Declare({
  name: "claim",
  description: "Claim rewards from an unlocked achievement",
})
@Options(claimOptions)
export class AchievementsClaimSubCommand extends SubCommand {
  async run(ctx: CommandContext<typeof claimOptions>) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;
    const achievementId = ctx.options.id;

    if (!guildId) {
      await ctx.write({
        embeds: [
          buildAchievementErrorEmbed(
            "This command can only be used in a server.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const claimResult = await achievementService.claimRewards({
      userId,
      guildId,
      achievementId,
    });

    if (claimResult.isErr()) {
      const error = claimResult.error;
      let message = error.message;

      if (error.code === "ACHIEVEMENT_NOT_UNLOCKED") {
        message = "You haven't unlocked this achievement yet.";
      } else if (error.code === "REWARDS_ALREADY_CLAIMED") {
        message = "You've already claimed rewards from this achievement.";
      }

      await ctx.write({
        embeds: [buildAchievementErrorEmbed(message)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const result = claimResult.unwrap();

    // Get achievement name for display
    const achievementResult = await achievementService.getAchievementView(
      userId,
      guildId,
      achievementId,
    );
    const achievementName =
      achievementResult.isOk() && achievementResult.unwrap()
        ? achievementResult.unwrap()!.name
        : achievementId;

    const embed = buildRewardClaimEmbed(achievementName, result.rewards);
    await ctx.write({ embeds: [embed] });
  }
}

// Subcommand: category
const categoryOptions = {
  category: createStringOption({
    description: "Achievement category to view",
    required: true,
    choices: [
      { name: "📈 Progression", value: "progression" },
      { name: "🎮 Minigames", value: "minigame" },
      { name: "⚒️ Crafting", value: "crafting" },
      { name: "👥 Social", value: "social" },
      { name: "🎒 Collection", value: "collection" },
      { name: "✨ Special", value: "special" },
    ],
  }),
};

@Declare({
  name: "category",
  description: "View achievements by category",
})
@Options(categoryOptions)
export class AchievementsCategorySubCommand extends SubCommand {
  async run(ctx: CommandContext<typeof categoryOptions>) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;
    const category = ctx.options.category;

    if (!guildId) {
      await ctx.write({
        embeds: [
          buildAchievementErrorEmbed(
            "This command can only be used in a server.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const boardResult = await achievementService.getAchievementBoard(
      userId,
      guildId,
    );
    if (boardResult.isErr()) {
      await ctx.write({
        embeds: [
          buildAchievementErrorEmbed(`Error: ${boardResult.error.message}`),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const categoryAchievements = boardResult
      .unwrap()
      .achievements.filter((a) => a.category === category);

    if (categoryAchievements.length === 0) {
      await ctx.write({
        embeds: [
          buildAchievementErrorEmbed("No achievements in this category."),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = buildCategoryAchievementsEmbed(
      category,
      categoryAchievements,
    );
    await ctx.write({ embeds: [embed] });
  }
}

// Subcommand: list
@Declare({
  name: "list",
  description: "List all available achievements",
})
export class AchievementsListSubCommand extends SubCommand {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;

    if (!guildId) {
      await ctx.write({
        embeds: [
          buildAchievementErrorEmbed(
            "This command can only be used in a server.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const boardResult = await achievementService.getAchievementBoard(
      userId,
      guildId,
    );
    if (boardResult.isErr()) {
      await ctx.write({
        embeds: [
          buildAchievementErrorEmbed(`Error: ${boardResult.error.message}`),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const achievements = boardResult.unwrap().achievements;

    // Group by category
    const byCategory = new Map<string, typeof achievements>();
    for (const achievement of achievements) {
      const list = byCategory.get(achievement.category) ?? [];
      list.push(achievement);
      byCategory.set(achievement.category, list);
    }

    const { Embed } = await import("seyfert");
    const embed = new Embed()
      .setTitle("📜 Achievement List")
      .setDescription(`There are ${achievements.length} achievements available.`)
      .setColor(0xf39c12);

    for (const [cat, list] of byCategory) {
      const catInfo = CATEGORY_DISPLAY[cat as keyof typeof CATEGORY_DISPLAY];
      const lines = list.map((a) => {
        const status = a.isUnlocked ? "✅" : "🔒";
        return `${status} ${a.tierEmoji} ${a.name}`;
      });

      embed.addFields({
        name: `${catInfo.emoji} ${catInfo.name}`,
        value: lines.join("\n").slice(0, 1024),
        inline: false,
      });
    }

    await ctx.write({ embeds: [embed] });
  }
}
