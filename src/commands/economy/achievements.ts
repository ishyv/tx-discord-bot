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
  description: "🏆 Gestiona tus logros y recompensas",
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
            "Este comando solo puede usarse en un servidor.",
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
    description: "ID del logro a ver",
    required: true,
  }),
};

@Declare({
  name: "view",
  description: "Ver detalles de un logro específico",
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
            "Este comando solo puede usarse en un servidor.",
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
        embeds: [buildAchievementErrorEmbed("Logro no encontrado.")],
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
    description: "ID del logro para reclamar recompensas",
    required: true,
  }),
};

@Declare({
  name: "claim",
  description: "Reclamar recompensas de un logro desbloqueado",
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
            "Este comando solo puede usarse en un servidor.",
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
        message = "Aún no has desbloqueado este logro.";
      } else if (error.code === "REWARDS_ALREADY_CLAIMED") {
        message = "Ya has reclamado las recompensas de este logro.";
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
    description: "Categoría de logros a ver",
    required: true,
    choices: [
      { name: "📈 Progresión", value: "progression" },
      { name: "🎮 Minijuegos", value: "minigame" },
      { name: "⚒️ Crafteo", value: "crafting" },
      { name: "👥 Social", value: "social" },
      { name: "🎒 Colección", value: "collection" },
      { name: "✨ Especial", value: "special" },
    ],
  }),
};

@Declare({
  name: "category",
  description: "Ver logros por categoría",
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
            "Este comando solo puede usarse en un servidor.",
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
          buildAchievementErrorEmbed("No hay logros en esta categoría."),
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
  description: "Listar todos los logros disponibles",
})
export class AchievementsListSubCommand extends SubCommand {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;

    if (!guildId) {
      await ctx.write({
        embeds: [
          buildAchievementErrorEmbed(
            "Este comando solo puede usarse en un servidor.",
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
      .setTitle("📜 Lista de Logros")
      .setDescription(`Hay ${achievements.length} logros disponibles.`)
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
