/**
 * Title Command.
 *
 * Purpose: Manage equipped titles and display badges.
 * Subcommands: set, list, clear, badges.
 */

import {
  Command,
  Declare,
  SubCommand,
  type CommandContext,
  Options,
  createStringOption,
  createNumberOption,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
  achievementService,
  buildTitlesEmbed,
  buildTitleEquippedEmbed,
  buildBadgeSlotsEmbed,
  buildAchievementErrorEmbed,
  buildAchievementSuccessEmbed,
} from "@/modules/economy/achievements";

@Declare({
  name: "title",
  description: "🏷️ Gestiona tus títulos e insignias",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 3000,
  uses: { default: 5 },
})
export default class TitleCommand extends Command {
  // Default: show equipped title
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

    const equippedResult = await achievementService.getEquippedTitle(
      userId,
      guildId,
    );
    if (equippedResult.isErr()) {
      await ctx.write({
        embeds: [
          buildAchievementErrorEmbed(`Error: ${equippedResult.error.message}`),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const equipped = equippedResult.unwrap();

    if (!equipped) {
      await ctx.write({
        embeds: [
          buildAchievementSuccessEmbed(
            "Sin Título",
            "No tienes ningún título equipado.\n\n" +
              "Usa `/title list` para ver tus títulos disponibles\n" +
              "o `/title set <id>` para equipar uno.\n\n" +
              "Desbloquea logros para obtener más títulos.",
          ),
        ],
      });
      return;
    }

    let display = equipped.titleName;
    if (equipped.prefix) display = `${equipped.prefix}${display}`;
    if (equipped.suffix) display = `${display}${equipped.suffix}`;

    await ctx.write({
      embeds: [
        buildAchievementSuccessEmbed(
          "Título Actual",
          `Tienes equipado: **${display}**\n\n` +
            `Usa \`/title list\` para ver todos tus títulos.`,
        ),
      ],
    });
  }
}

// Subcommand: set
const setOptions = {
  id: createStringOption({
    description: "ID del título a equipar",
    required: true,
  }),
};

@Declare({
  name: "set",
  description: "Equipar un título",
})
@Options(setOptions)
export class TitleSetSubCommand extends SubCommand {
  async run(ctx: CommandContext<typeof setOptions>) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;
    const titleId = ctx.options.id;

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

    const equipResult = await achievementService.equipTitle({
      userId,
      guildId,
      titleId,
    });

    if (equipResult.isErr()) {
      const error = equipResult.error;
      let message = error.message;

      if (error.code === "TITLE_NOT_OWNED") {
        message =
          "No tienes este título. Desbloquéalo completando el logro correspondiente.";
      }

      await ctx.write({
        embeds: [buildAchievementErrorEmbed(message)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get title info for display
    const titlesResult = await achievementService.getTitles(userId, guildId);
    const title = titlesResult.isOk()
      ? titlesResult.unwrap().find((t) => t.id === titleId)
      : undefined;

    if (title) {
      const embed = buildTitleEquippedEmbed(title);
      await ctx.write({ embeds: [embed] });
    } else {
      await ctx.write({
        embeds: [
          buildAchievementSuccessEmbed(
            "Título Equipado",
            "Tu título ha sido equipado correctamente.",
          ),
        ],
      });
    }
  }
}

// Subcommand: list
@Declare({
  name: "list",
  description: "Listar todos tus títulos disponibles",
})
export class TitleListSubCommand extends SubCommand {
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

    const titlesResult = await achievementService.getTitles(userId, guildId);
    if (titlesResult.isErr()) {
      await ctx.write({
        embeds: [
          buildAchievementErrorEmbed(`Error: ${titlesResult.error.message}`),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const titles = titlesResult.unwrap();

    if (titles.length === 0) {
      await ctx.write({
        embeds: [
          buildAchievementSuccessEmbed(
            "Sin Títulos",
            "Aún no tienes títulos.\n\n" +
              "Desbloquea logros para obtener títulos únicos.\n" +
              "Usa `/achievements` para ver los logros disponibles.",
          ),
        ],
      });
      return;
    }

    const embed = buildTitlesEmbed(titles, ctx.author.username);
    await ctx.write({ embeds: [embed] });
  }
}

// Subcommand: clear
@Declare({
  name: "clear",
  description: "Quitar el título equipado",
})
export class TitleClearSubCommand extends SubCommand {
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

    const unequipResult = await achievementService.unequipTitle(
      userId,
      guildId,
    );
    if (unequipResult.isErr()) {
      await ctx.write({
        embeds: [
          buildAchievementErrorEmbed(`Error: ${unequipResult.error.message}`),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await ctx.write({
      embeds: [
        buildAchievementSuccessEmbed(
          "Título Removido",
          "Ya no tienes ningún título equipado.",
        ),
      ],
    });
  }
}

// Subcommand: badges
const badgeOptions = {
  slot: createNumberOption({
    description: "Slot de insignia (1-3)",
    required: false,
    min_value: 1,
    max_value: 3,
  }),
  badge: createStringOption({
    description: "ID de la insignia a equipar (dejar vacío para quitar)",
    required: false,
  }),
};

@Declare({
  name: "badges",
  description: "Ver o gestionar tus insignias",
})
@Options(badgeOptions)
export class TitleBadgesSubCommand extends SubCommand {
  async run(ctx: CommandContext<typeof badgeOptions>) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;
    const slot = ctx.options.slot;
    const badgeId = ctx.options.badge;

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

    // If slot specified, set badge
    if (slot) {
      const setResult = await achievementService.setBadgeSlot(
        userId,
        guildId,
        slot as 1 | 2 | 3,
        badgeId || null,
      );

      if (setResult.isErr()) {
        await ctx.write({
          embeds: [
            buildAchievementErrorEmbed(`Error: ${setResult.error.message}`),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const action = badgeId ? "equipada" : "removida";
      await ctx.write({
        embeds: [
          buildAchievementSuccessEmbed(
            "Insignia Actualizada",
            `Insignia ${action} en el slot ${slot}.`,
          ),
        ],
      });
      return;
    }

    // Otherwise, show current badges
    const badgesResult = await achievementService.getEquippedBadges(
      userId,
      guildId,
    );
    if (badgesResult.isErr()) {
      await ctx.write({
        embeds: [
          buildAchievementErrorEmbed(`Error: ${badgesResult.error.message}`),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = buildBadgeSlotsEmbed(
      badgesResult.unwrap(),
      ctx.author.username,
    );
    await ctx.write({ embeds: [embed] });
  }
}
