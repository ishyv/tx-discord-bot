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
  description: "🏷️ Manage your titles and badges",
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
            "This command can only be used in a server.",
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
            "No Title",
            "You don't have any title equipped.\n\n" +
            "Use `/title list` to see your available titles\n" +
            "or `/title set <id>` to equip one.\n\n" +
            "Unlock achievements to get more titles.",
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
          "Current Title",
          `You have equipped: **${display}**\n\n` +
          `Use \`/title list\` to see all your titles.`,
        ),
      ],
    });
  }
}

// Subcommand: set
const setOptions = {
  id: createStringOption({
    description: "ID of the title to equip",
    required: true,
  }),
};

@Declare({
  name: "set",
  description: "Equip a title",
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
            "This command can only be used in a server.",
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
          "You don't own this title. Unlock it by completing the corresponding achievement.";
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
            "Title Equipped",
            "Your title has been equipped successfully.",
          ),
        ],
      });
    }
  }
}

// Subcommand: list
@Declare({
  name: "list",
  description: "List all your available titles",
})
export class TitleListSubCommand extends SubCommand {
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
            "No Titles",
            "You don't have any titles yet.\n\n" +
            "Unlock achievements to get unique titles.\n" +
            "Use `/achievements` to see available achievements.",
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
  description: "Remove the equipped title",
})
export class TitleClearSubCommand extends SubCommand {
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
          "Title Removed",
          "You no longer have any title equipped.",
        ),
      ],
    });
  }
}

// Subcommand: badges
const badgeOptions = {
  slot: createNumberOption({
    description: "Badge slot (1-3)",
    required: false,
    min_value: 1,
    max_value: 3,
  }),
  badge: createStringOption({
    description: "ID of the badge to equip (leave empty to remove)",
    required: false,
  }),
};

@Declare({
  name: "badges",
  description: "View or manage your badges",
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
            "This command can only be used in a server.",
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

      const action = badgeId ? "equipped" : "removed";
      await ctx.write({
        embeds: [
          buildAchievementSuccessEmbed(
            "Badge Updated",
            `Badge ${action} in slot ${slot}.`,
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
