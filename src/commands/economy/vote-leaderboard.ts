/**
 * Vote Leaderboard Command.
 *
 * Purpose: Show top users by love/hate/net votes.
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
import { UIColors } from "@/modules/ui/design-system";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { votingService } from "@/modules/economy/voting";

const leaderboardOptions = {
  type: createStringOption({
    description: "Leaderboard type",
    required: false,
    choices: [
      { name: "💖 Most Love", value: "love" },
      { name: "😤 Most Hate", value: "hate" },
      { name: "⭐ Best Ratio", value: "net" },
    ],
  }),
  limit: createIntegerOption({
    description: "Number of users to show (5-20)",
    required: false,
    min_value: 5,
    max_value: 20,
  }),
};

@Declare({
  name: "vote-leaderboard",
  description: "View voting rankings for this server",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 10000,
  uses: { default: 1 },
})
@Options(leaderboardOptions)
export default class VoteLeaderboardCommand extends Command {
  async run(ctx: GuildCommandContext<typeof leaderboardOptions>) {
    const guildId = ctx.guildId;

    if (!guildId) {
      await ctx.write({
        content: "❌ This command only works in servers.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const type = (ctx.options.type ?? "love") as "love" | "hate" | "net";
    const limit = ctx.options.limit ?? 10;

    const result = await votingService.getLeaderboard(guildId, type, limit);

    if (result.isErr()) {
      await ctx.write({
        content: "❌ Error loading the leaderboard.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const leaderboard = result.unwrap();

    if (leaderboard.length === 0) {
      await ctx.write({
        content: "📊 No votes have been recorded in this server yet.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const titleMap = {
      love: "💖 Top Love Received",
      hate: "😤 Top Hate Received",
      net: "⭐ Best Ratio (Love - Hate)",
    };

    const emojiMap = {
      love: "💖",
      hate: "😤",
      net: "⭐",
    };

    const description = leaderboard
      .map((entry, index) => {
        const medal =
          index === 0
            ? "🥇"
            : index === 1
              ? "🥈"
              : index === 2
                ? "🥉"
                : `${index + 1}.`;
        return `${medal} <@${entry.userId}>: ${emojiMap[type]} ${entry.score}`;
      })
      .join("\n");

    const embed = new Embed()
      .setColor(
        type === "love"
          ? UIColors.success
          : type === "hate"
            ? UIColors.error
            : UIColors.gold,
      )
      .setTitle(titleMap[type])
      .setDescription(description)
      .setFooter({ text: `Showing top ${leaderboard.length}` });

    await ctx.write({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }
}
