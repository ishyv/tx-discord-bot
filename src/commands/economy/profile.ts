/**
 * Profile Command (Phase 9b).
 *
 * Purpose: Display comprehensive economy profile.
 * Features:
 * - Account status and metadata
 * - Balance summary
 * - Bank info
 * - Inventory summary
 * - Reputation
 * - Title and badges display
 * - Handles blocked/banned accounts gracefully
 */

import { Command, Declare, type CommandContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
  economyAccountRepo,
  createEconomyAccountService,
  buildProfileEmbed,
  buildAccessDeniedEmbed,
  buildAccountCreatedEmbed,
  buildErrorEmbed,
  EconomyError,
  DEFAULT_MAX_VISIBLE_CURRENCIES,
  votingService,
  votingRepo,
  formatVoteCounts,
  calculateLoveRatio,
} from "@/modules/economy";
import { achievementService } from "@/modules/economy/achievements";

// Service instance
const economyService = createEconomyAccountService(economyAccountRepo);

@Declare({
  name: "profile",
  description: "📊 Show your economy profile",
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 5000,
  uses: { default: 1 },
})
export default class ProfileCommand extends Command {
  async run(ctx: CommandContext) {
    const userId = ctx.author.id;

    // Ensure account (for isNew check)
    const ensureResult = await economyService.ensureAccount(userId);
    if (ensureResult.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed("No pude cargar tu perfil.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { isNew } = ensureResult.unwrap();

    // Get full profile
    const result = await economyService.getProfileSummary(userId, {
      balanceOptions: {
        maxVisible: DEFAULT_MAX_VISIBLE_CURRENCIES,
        showZeroBalances: false,
      },
      guildId: ctx.guildId ?? undefined,
    });

    if (result.isErr()) {
      const error = result.error;
      if (error instanceof EconomyError) {
        if (
          error.code === "ACCOUNT_BLOCKED" ||
          error.code === "ACCOUNT_BANNED"
        ) {
          await ctx.write({
            embeds: [
              buildAccessDeniedEmbed(
                error.code === "ACCOUNT_BANNED" ? "banned" : "blocked",
              ),
            ],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      await ctx.write({
        embeds: [buildErrorEmbed("No pude cargar tu perfil.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const view = result.unwrap();

    // Fetch achievements data for profile display
    let achievementsData = undefined;
    if (ctx.guildId) {
      const boardResult = await achievementService.getAchievementBoard(
        userId,
        ctx.guildId,
      );
      const equippedTitleResult = await achievementService.getEquippedTitle(
        userId,
        ctx.guildId,
      );
      const equippedBadgesResult = await achievementService.getEquippedBadges(
        userId,
        ctx.guildId,
      );

      if (boardResult.isOk()) {
        const board = boardResult.unwrap();
        const equippedTitle = equippedTitleResult.isOk()
          ? equippedTitleResult.unwrap()
          : undefined;
        const equippedBadges = equippedBadgesResult.isOk()
          ? equippedBadgesResult.unwrap()
          : [];

        achievementsData = {
          equippedTitle: equippedTitle
            ? {
                displayName: equippedTitle.titleName,
                prefix: equippedTitle.prefix,
                suffix: equippedTitle.suffix,
              }
            : undefined,
          equippedBadges: equippedBadges
            .filter((b): b is NonNullable<typeof b> => b !== null)
            .slice(0, 3)
            .map((b) => ({ emoji: b.emoji, name: b.name })),
          unlockedCount: board.unlockedCount,
          totalCount: board.totalCount,
        };
      }
    }

    const embed = buildProfileEmbed(
      view,
      ctx.author.username,
      ctx.author.avatarURL(),
      achievementsData,
    );

    // Add voting stats if available
    if (ctx.guildId) {
      const configResult = await votingRepo.getConfig(ctx.guildId);
      if (configResult.isOk() && configResult.unwrap().showInProfile) {
        const statsResult = await votingService.getUserStats(
          ctx.guildId,
          userId,
        );
        const prefsResult = await votingService.getUserPrefs(userId);

        if (statsResult.isOk() && prefsResult.isOk()) {
          const stats = statsResult.unwrap();
          const prefs = prefsResult.unwrap();

          // Only show if user hasn't opted out or if viewing own profile
          if (!prefs.optOut) {
            const totalVotes = stats.loveCount + stats.hateCount;
            if (totalVotes > 0) {
              embed.addFields({
                name: "💝 Reputation",
                value:
                  formatVoteCounts(stats.loveCount, stats.hateCount) +
                  `\nRatio: ${calculateLoveRatio(stats.loveCount, stats.hateCount)}% 💝`,
                inline: true,
              });
            }
          }
        }
      }
    }

    // On first use, show creation notice
    if (isNew) {
      await ctx.write({
        embeds: [buildAccountCreatedEmbed(ctx.author.username), embed],
      });
      return;
    }

    await ctx.write({ embeds: [embed] });
  }
}
