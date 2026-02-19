/**
 * Trivia Admin Command (Phase 9c).
 *
 * Purpose: Admin tools for managing trivia questions - stats and list.
 * Note: Adding questions is done via the trivia-add-modal interaction.
 */
import { HelpDoc, HelpCategory } from "@/modules/help";
import {
  Command,
  Declare,
  Options,
  type GuildCommandContext,
  createStringOption,
  createIntegerOption,
  Embed,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { UIColors } from "@/modules/ui/design-system";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
  TOTAL_QUESTIONS,
  CATEGORY_INFO,
  DIFFICULTY_CONFIG,
  getCategoryStats,
  getQuestionsByCategory,
  type TriviaCategory,
  type TriviaDifficulty,
} from "@/modules/economy/minigames";
import { buildErrorEmbed } from "@/modules/economy";

const options = {
  action: createStringOption({
    description: "Action to perform",
    required: true,
    choices: [
      { name: "📊 View stats", value: "stats" },
      { name: "📋 List questions", value: "list" },
    ],
  }),
  category: createStringOption({
    description: "Category to filter",
    required: false,
    choices: Object.entries(CATEGORY_INFO).map(([id, info]) => ({
      name: `${info.emoji} ${info.name}`,
      value: id,
    })),
  }),
  difficulty: createIntegerOption({
    description: "Filter by difficulty (1-5)",
    required: false,
    min_value: 1,
    max_value: 5,
  }),
};

@HelpDoc({
  command: "trivia-admin",
  category: HelpCategory.Economy,
  description: "Admin tools for managing trivia questions — view stats and list questions",
  usage: "/trivia-admin [action] [page]",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "trivia-admin",
  description: "Trivia question management (stats and listing)",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageGuild"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 3000,
  uses: { default: 1 },
})
@Options(options)
export default class TriviaAdminCommand extends Command {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    const action = ctx.options.action;

    if (!guildId) {
      await ctx.write({
        embeds: [buildErrorEmbed("This command only works in servers.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    switch (action) {
      case "stats":
        await this.handleStats(ctx);
        break;
      case "list":
        await this.handleList(ctx);
        break;
      default:
        await ctx.write({
          embeds: [buildErrorEmbed("Invalid action. Use stats or list.")],
          flags: MessageFlags.Ephemeral,
        });
    }
  }

  private async handleStats(ctx: GuildCommandContext) {
    const categoryFilter = (ctx.options as any).category as TriviaCategory | undefined;
    const stats = getCategoryStats();

    const embed = new Embed()
      .setColor(UIColors.info)
      .setTitle("📊 Trivia Statistics")
      .setDescription(`Total questions: **${TOTAL_QUESTIONS}**`);

    if (categoryFilter) {
      // Show detailed stats for specific category
      const catStats = stats[categoryFilter];
      const catInfo = CATEGORY_INFO[categoryFilter];

      embed
        .setTitle(`${catInfo.emoji} Stats: ${catInfo.name}`)
        .setDescription(`Total: **${catStats.total}** questions\n${catInfo.description}`)
        .addFields(
          {
            name: "📈 By Difficulty",
            value: Object.entries(catStats.byDifficulty)
              .map(([diff, count]) => {
                const d = Number(diff) as TriviaDifficulty;
                const config = DIFFICULTY_CONFIG[d];
                return `${config.emoji} ${config.name}: ${count}`;
              })
              .join("\n"),
            inline: true,
          },
          {
            name: "💰 Multipliers",
            value: Object.entries(DIFFICULTY_CONFIG)
              .map(([, config]) => {
                return `${config.emoji} ${config.currencyMultiplier}x coins, ${config.xpMultiplier}x XP`;
              })
              .join("\n"),
            inline: true,
          }
        );
    } else {
      // Show overview of all categories
      const fields = Object.entries(stats).map(([catId, catStats]) => {
        const catInfo = CATEGORY_INFO[catId as TriviaCategory];
        const difficultyDist = Object.entries(catStats.byDifficulty)
          .filter(([, count]) => count > 0)
          .map(([diff, count]) => `${DIFFICULTY_CONFIG[Number(diff) as TriviaDifficulty].emoji} ${count}`)
          .join(" ");

        return {
          name: `${catInfo.emoji} ${catInfo.name}`,
          value: `Total: ${catStats.total} | ${difficultyDist}`,
          inline: true,
        };
      });

      embed.addFields(fields);
    }

    embed.setFooter({
      text: "Use /trivia-admin action:stats category:<name> for details"
    });

    await ctx.write({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }

  private async handleList(ctx: GuildCommandContext) {
    const category = (ctx.options as any).category as TriviaCategory | undefined;
    const difficultyFilter = (ctx.options as any).difficulty as TriviaDifficulty | undefined;

    if (!category) {
      await ctx.write({
        embeds: [buildErrorEmbed("You must specify a category with the 'category' option.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let questions = getQuestionsByCategory(category);

    if (difficultyFilter) {
      questions = questions.filter(q => q.difficulty === difficultyFilter);
    }

    const catInfo = CATEGORY_INFO[category];

    // Paginate results (max 10 per embed to avoid hitting limits)
    const pageSize = 10;
    const totalPages = Math.ceil(questions.length / pageSize);
    const currentPage = 1;
    const startIdx = (currentPage - 1) * pageSize;
    const pageQuestions = questions.slice(startIdx, startIdx + pageSize);

    const embed = new Embed()
      .setColor(UIColors.info)
      .setTitle(`${catInfo.emoji} Questions: ${catInfo.name}`)
      .setDescription(
        `Showing ${pageQuestions.length} of ${questions.length} questions` +
        (difficultyFilter ? ` (Difficulty ${difficultyFilter})` : "")
      );

    for (const q of pageQuestions) {
      const diffConfig = DIFFICULTY_CONFIG[q.difficulty];
      embed.addFields({
        name: `${diffConfig.emoji} ${q.question.slice(0, 50)}${q.question.length > 50 ? "..." : ""}`,
        value: `ID: \`${q.id}\` | Correct: ${["A", "B", "C", "D"][q.correctIndex]} | Tags: ${q.tags.slice(0, 3).join(", ")}`,
        inline: false,
      });
    }

    if (questions.length === 0) {
      embed.addFields({
        name: "No results",
        value: "No questions found with the specified filters.",
        inline: false,
      });
    }

    embed.setFooter({
      text: `Page ${currentPage}/${Math.max(1, totalPages)}`
    });

    await ctx.write({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }
}
