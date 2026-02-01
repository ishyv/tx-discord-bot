/**
 * Quests Command - Interactive Quest Board.
 *
 * Purpose: Display the quest board with daily, weekly, and featured quests.
 * Features: Interactive tabs, progress tracking, claim notifications.
 */

import {
  Command,
  Declare,
  type CommandContext,
  Options,
  createStringOption,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
  questService,
  questRotationService,
  type QuestRotationType,
} from "@/modules/economy/quests";
import {
  buildQuestBoardEmbed,
  buildQuestErrorEmbed,
} from "@/modules/economy/quests/ui";

const options = {
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
  name: "quests",
  description: "📜 Open the interactive Quest Board",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 10000,
  uses: { default: 3 },
})
@Options(options)
export default class QuestsCommand extends Command {
  async run(ctx: CommandContext<typeof options>) {
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
