/**
 * Vote Config Command.
 *
 * Purpose: Configure voting preferences and opt-out.
 */
import {
  Command,
  Declare,
  Options,
  type GuildCommandContext,
  createBooleanOption,
  Embed,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { UIColors } from "@/modules/ui/design-system";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
  votingService,
  votingRepo,
  formatVoteCounts,
  calculateLoveRatio,
  VOTE_BADGES,
} from "@/modules/economy/voting";

const configOptions = {
  opt_out: createBooleanOption({
    description: "Disable receiving votes (true = no votes)",
    required: false,
  }),
  show: createBooleanOption({
    description: "Show your stats on public profile",
    required: false,
  }),
};

@Declare({
  name: "vote-config",
  description: "Configure your voting preferences",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 3000,
  uses: { default: 1 },
})
@Options(configOptions)
export default class VoteConfigCommand extends Command {
  async run(ctx: GuildCommandContext<typeof configOptions>) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;
    const optOut = ctx.options.opt_out;
    const show = ctx.options.show;

    if (!guildId) {
      await ctx.write({
        content: "❌ This command only works in servers.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Handle opt-out toggle
    if (optOut !== undefined) {
      const result = await votingService.updateUserPrefs(userId, { optOut });
      if (result.isErr()) {
        await ctx.write({
          content: "❌ Error updating preferences.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await ctx.write({
        content: optOut
          ? "🚫 You will no longer receive votes."
          : "✅ You can now receive votes.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Handle show toggle
    if (show !== undefined) {
      const result = await votingService.updateUserPrefs(userId, {
        showVotes: show,
      });
      if (result.isErr()) {
        await ctx.write({
          content: "❌ Error updating preferences.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await ctx.write({
        content: show
          ? "✅ Your stats will be shown on your profile."
          : "🚫 Your stats will not be shown publicly.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Show current status (no options provided)
    const [prefsResult, statsResult, badgesResult, configResult] =
      await Promise.all([
        votingService.getUserPrefs(userId),
        votingService.getUserStats(guildId, userId),
        votingService.getUserBadges(guildId, userId),
        votingRepo.getConfig(guildId),
      ]);

    const prefs = prefsResult.unwrap();
    const stats = statsResult.unwrap();
    const badges = badgesResult.unwrap();
    const config = configResult.unwrap();

    const embed = new Embed()
      .setColor(UIColors.info)
      .setTitle("⚙️ Vote Configuration")
      .setDescription(
        `**Status:** ${prefs.optOut ? "🚫 Opt-out" : "✅ Active"}\n` +
        `**Show on profile:** ${prefs.showVotes ? "✅ Yes" : "🚫 No"}\n` +
        `**Votes today:** ${stats.dailyVoteCount}/${config.dailyMaxVotes}\n\n` +
        `**Your stats:**\n${formatVoteCounts(stats.loveCount, stats.hateCount)}\n` +
        `Ratio: ${calculateLoveRatio(stats.loveCount, stats.hateCount)}% 💝`,
      );

    if (badges.length > 0) {
      embed.addFields({
        name: "🏅 Unlocked Badges",
        value: badges
          .map((b) => `${b.emoji} **${b.name}**: ${b.description}`)
          .join("\n"),
        inline: false,
      });
    } else {
      embed.addFields({
        name: "🏅 Badges",
        value: "You don't have any badges yet. Receive votes to unlock them!",
        inline: false,
      });
    }

    // Show next badge targets
    const earnedIds = new Set(badges.map((b) => b.id));
    const nextBadges = VOTE_BADGES.filter((b) => !earnedIds.has(b.id)).slice(
      0,
      3,
    );

    if (nextBadges.length > 0) {
      embed.addFields({
        name: "🎯 Next Badges",
        value: nextBadges
          .map((b) => `${b.emoji} ${b.name}: ${b.description}`)
          .join("\n"),
        inline: false,
      });
    }

    embed.setFooter({
      text: "Use /vote-config opt-out:true/false to change your settings",
    });

    await ctx.write({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }
}
