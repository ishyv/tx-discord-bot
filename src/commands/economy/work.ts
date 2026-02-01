/**
 * Work Command (Phase 3d).
 *
 * Purpose: User claims a repeatable work payout with cooldown + daily cap.
 * Funding: Hybrid payout (Minted Base + Treasury Bonus).
 */

import { Command, Declare, type CommandContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import {
  createEconomyAccountService,
  economyAccountRepo,
  guildEconomyService,
  buildErrorEmbed,
} from "@/modules/economy";
import { buildWorkClaimEmbed } from "@/modules/economy/account/embeds";
import { currencyRegistry } from "@/modules/economy/transactions";

@Declare({
  name: "work",
  description:
    "Earn a small payout from the guild work sector (cooldown + daily cap)",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
export default class WorkCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;

    if (!guildId) {
      await ctx.write({
        embeds: [buildErrorEmbed("This command can only be used in a server.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const accountService = createEconomyAccountService(economyAccountRepo);
    const ensureResult = await accountService.ensureAccount(userId);
    if (ensureResult.isErr()) {
      await ctx.write({
        embeds: [
          buildErrorEmbed("Could not load your account. Try again later."),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { account } = ensureResult.unwrap();
    if (account.status !== "ok") {
      await ctx.write({
        embeds: [
          buildErrorEmbed(
            "Your account has restrictions. You cannot use /work.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const configResult = await guildEconomyService.getConfig(guildId);
    if (configResult.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed("Economy is not configured for this server.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const config = configResult.unwrap();
    const { workDailyCap } = config.work;

    const { workService } = await import("@/modules/economy/work/service");
    const payoutResult = await workService.processHybridWorkPayout(
      guildId,
      userId,
    );

    if (payoutResult.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed("Something went wrong. Try again later.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const claim = payoutResult.unwrap();
    if (!claim.granted) {
      if (claim.reason === "cooldown") {
        const remainingMs = claim.cooldownEndsAt
          ? Math.max(0, claim.cooldownEndsAt.getTime() - Date.now())
          : 0;
        const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
        await ctx.write({
          embeds: [
            buildErrorEmbed(
              `You already worked recently. Try again in **${remainingMinutes}m**.\n\n💡 Remaining today: **${claim.remainingToday}/${workDailyCap}**`,
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (claim.reason === "cap") {
        await ctx.write({
          embeds: [
            buildErrorEmbed(
              `You reached the daily work cap (**${workDailyCap}/${workDailyCap}**).\n\n💡 Try again tomorrow!`,
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await ctx.write({
        embeds: [
          buildErrorEmbed("You cannot work right now. Try again later."),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (claim.failed) {
      await ctx.write({
        embeds: [
          buildErrorEmbed(
            `😢 **Work Failed**\n\nYou couldn't finish the job this time. No payout.\n\n💡 Remaining today: **${claim.remainingToday}/${workDailyCap}**`,
          ),
        ],
      });
      return;
    }

    const currencyObj = currencyRegistry.get(claim.currencyId);
    const display = (n: number) =>
      currencyObj?.display(n as any) ?? `${n} ${claim.currencyId}`;

    const embed = buildWorkClaimEmbed({
      payout: claim.totalPaid,
      baseMint: claim.baseMint,
      bonusFromWorks: claim.bonusFromWorks,
      bonusPct: claim.bonusPct,
      currencyId: claim.currencyId,
      display,
      balanceBefore: claim.userBalanceBefore,
      balanceAfter: claim.userBalanceAfter,
      remainingToday: claim.remainingToday,
      dailyCap: workDailyCap,
      correlationId: claim.correlationId,
      levelUp: claim.levelUp,
      newLevel: claim.newLevel,
    });

    await ctx.write({ embeds: [embed] });
  }
}
