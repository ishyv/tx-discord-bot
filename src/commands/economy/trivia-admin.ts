/**
 * Trivia Admin Command (Phase 9c).
 *
 * Purpose: Admin tools for managing trivia questions - stats and list.
 * Note: Adding questions is done via the trivia-add-modal interaction.
 */
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
import { EmbedColors } from "seyfert/lib/common";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
  TOTAL_QUESTIONS,
  CATEGORY_INFO,
  DIFFICULTY_CONFIG,
  getCategoryStats,
  type TriviaCategory,
  type TriviaDifficulty,
} from "@/modules/economy/minigames";
import { buildErrorEmbed } from "@/modules/economy";

const options = {
  action: createStringOption({
    description: "Acción a realizar",
    required: true,
    choices: [
      { name: "📊 Ver estadísticas", value: "stats" },
      { name: "📋 Listar preguntas", value: "list" },
    ],
  }),
  category: createStringOption({
    description: "Categoría para filtrar",
    required: false,
    choices: Object.entries(CATEGORY_INFO).map(([id, info]) => ({
      name: `${info.emoji} ${info.name}`,
      value: id,
    })),
  }),
  difficulty: createIntegerOption({
    description: "Filtrar por dificultad (1-5)",
    required: false,
    min_value: 1,
    max_value: 5,
  }),
};

@Declare({
  name: "trivia-admin",
  description: "Administración de preguntas de trivia (estadísticas y listado)",
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
        embeds: [buildErrorEmbed("Este comando solo funciona en servidores.")],
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
          embeds: [buildErrorEmbed("Acción no válida. Usa stats o list.")],
          flags: MessageFlags.Ephemeral,
        });
    }
  }

  private async handleStats(ctx: GuildCommandContext) {
    const categoryFilter = (ctx.options as any).category as TriviaCategory | undefined;
    const stats = getCategoryStats();

    const embed = new Embed()
      .setColor(EmbedColors.Blue)
      .setTitle("📊 Estadísticas de Trivia")
      .setDescription(`Total de preguntas: **${TOTAL_QUESTIONS}**`);

    if (categoryFilter) {
      // Show detailed stats for specific category
      const catStats = stats[categoryFilter];
      const catInfo = CATEGORY_INFO[categoryFilter];
      
      embed
        .setTitle(`${catInfo.emoji} Estadísticas: ${catInfo.name}`)
        .setDescription(`Total: **${catStats.total}** preguntas\n${catInfo.description}`)
        .addFields(
          {
            name: "📈 Por Dificultad",
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
            name: "💰 Multiplicadores",
            value: Object.entries(DIFFICULTY_CONFIG)
              .map(([, config]) => {
                return `${config.emoji} ${config.currencyMultiplier}x monedas, ${config.xpMultiplier}x XP`;
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
      text: "Usa /trivia-admin action:stats category:<nombre> para detalles" 
    });

    await ctx.write({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }

  private async handleList(ctx: GuildCommandContext) {
    const { getQuestionsByCategory } = await import("@/modules/economy/minigames/trivia");
    
    const category = (ctx.options as any).category as TriviaCategory | undefined;
    const difficultyFilter = (ctx.options as any).difficulty as TriviaDifficulty | undefined;

    if (!category) {
      await ctx.write({
        embeds: [buildErrorEmbed("Debes especificar una categoría con la opción 'category'.")],
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
      .setColor(EmbedColors.Blue)
      .setTitle(`${catInfo.emoji} Preguntas: ${catInfo.name}`)
      .setDescription(
        `Mostrando ${pageQuestions.length} de ${questions.length} preguntas` +
        (difficultyFilter ? ` (Dificultad ${difficultyFilter})` : "")
      );

    for (const q of pageQuestions) {
      const diffConfig = DIFFICULTY_CONFIG[q.difficulty];
      embed.addFields({
        name: `${diffConfig.emoji} ${q.question.slice(0, 50)}${q.question.length > 50 ? "..." : ""}`,
        value: `ID: \`${q.id}\` | Correcta: ${["A", "B", "C", "D"][q.correctIndex]} | Tags: ${q.tags.slice(0, 3).join(", ")}`,
        inline: false,
      });
    }

    if (questions.length === 0) {
      embed.addFields({
        name: "Sin resultados",
        value: "No se encontraron preguntas con los filtros especificados.",
        inline: false,
      });
    }

    embed.setFooter({ 
      text: `Página ${currentPage}/${Math.max(1, totalPages)}` 
    });

    await ctx.write({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }
}
