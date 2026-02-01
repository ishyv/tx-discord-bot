/**
 * Quest Command - Individual Quest Management.
 *
 * Purpose: View quest details, check progress, and claim rewards.
 * Subcommands: view, claim, progress, list.
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
import { questService, questRepo } from "@/modules/economy/quests";
import {
  buildQuestDetailEmbed,
  buildClaimResultEmbed,
  buildQuestErrorEmbed,
  buildQuestSuccessEmbed,
} from "@/modules/economy/quests/ui";

@Declare({
  name: "quest",
  description: "📜 Gestiona tus misiones individuales",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 5000,
  uses: { default: 5 },
})
export default class QuestCommand extends Command {
  // Default: show help
  async run(ctx: CommandContext) {
    await ctx.write({
      embeds: [
        buildQuestSuccessEmbed(
          "Comandos de Misiones",
          "Usa las siguientes subcomandos:\n\n" +
            "`/quest view <id>` - Ver detalles de una misión\n" +
            "`/quest claim <id>` - Reclamar recompensas de una misión completada\n" +
            "`/quest progress` - Ver tu progreso general\n" +
            "`/quest list` - Listar misiones disponibles\n\n" +
            "O usa `/quests` para el Tablón de Misiones interactivo.",
        ),
      ],
    });
  }
}

// Subcommand: view
const viewOptions = {
  id: createStringOption({
    description: "ID de la misión a ver",
    required: true,
  }),
};

@Declare({
  name: "view",
  description: "Ver detalles de una misión específica",
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
            "Este comando solo puede usarse en un servidor.",
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
              `La misión "${template.name}" no está disponible en la rotación actual.`,
            ),
          ],
        });
        return;
      }

      await ctx.write({
        embeds: [buildQuestErrorEmbed("Misión no encontrada o no disponible.")],
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
        embeds: [buildQuestErrorEmbed("Misión no encontrada.")],
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
    description: "ID de la misión a reclamar",
    required: true,
  }),
};

@Declare({
  name: "claim",
  description: "Reclamar recompensas de una misión completada",
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
            "Este comando solo puede usarse en un servidor.",
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
            "Esta misión no está disponible en la rotación actual.",
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
        message = "Aún no has completado todos los requisitos de esta misión.";
      } else if (error.code === "REWARDS_ALREADY_CLAIMED") {
        message = "Ya has reclamado las recompensas de esta misión.";
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
  description: "Ver tu progreso general de misiones",
})
export class QuestProgressSubCommand extends SubCommand {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;

    if (!guildId) {
      await ctx.write({
        embeds: [
          buildQuestErrorEmbed(
            "Este comando solo puede usarse en un servidor.",
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
      .setTitle("📊 Tu Progreso de Misiones")
      .setColor(0x3498db)
      .addFields(
        {
          name: "🎯 Total Completadas",
          value: stats.totalCompleted.toString(),
          inline: true,
        },
        {
          name: "📅 Diarias Completadas",
          value: stats.dailyCompleted.toString(),
          inline: true,
        },
        {
          name: "📆 Semanales Completadas",
          value: stats.weeklyCompleted.toString(),
          inline: true,
        },
        {
          name: "⭐ Destacadas Completadas",
          value: stats.featuredCompleted.toString(),
          inline: true,
        },
        {
          name: "🎫 Quest Tokens",
          value: stats.questTokens.toString(),
          inline: true,
        },
        {
          name: "🎁 Diarias por Reclamar",
          value: dailyProgress.toString(),
          inline: true,
        },
        {
          name: "🎁 Semanales por Reclamar",
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
  description: "Listar todas las misiones disponibles",
})
export class QuestListSubCommand extends SubCommand {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId;

    if (!guildId) {
      await ctx.write({
        embeds: [
          buildQuestErrorEmbed(
            "Este comando solo puede usarse en un servidor.",
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
            "Sin Misiones",
            "No hay misiones configuradas en este servidor. Contacta a un administrador.",
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
      .setTitle("📜 Misiones Disponibles")
      .setDescription(
        `Hay ${templates.length} misiones configuradas en este servidor.`,
      )
      .setColor(0xf39c12);

    const difficultyOrder = ["easy", "medium", "hard", "expert", "legendary"];
    const difficultyNames: Record<string, string> = {
      easy: "🟢 Fácil",
      medium: "🔵 Medio",
      hard: "🟠 Difícil",
      expert: "🔴 Experto",
      legendary: "🟣 Legendario",
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
