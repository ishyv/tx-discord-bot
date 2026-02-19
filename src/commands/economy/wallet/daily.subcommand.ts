/**
 * Daily Subcommand (Part of /wallet).
 *
 * Purpose: Claim daily currency reward with streak bonuses.
 * Context: Guild-configurable cooldown and rewards.
 */

import { type CommandContext, Declare, SubCommand } from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { MessageFlags } from "seyfert/lib/types";
import {
	buildErrorEmbed,
	economyAccountService,
	dailyService,
} from "@/modules/economy";
import {
	buildDailyClaimEmbed,
	buildEconomyInfoEmbed,
} from "@/modules/economy/account/embeds";
import { currencyRegistry } from "@/modules/economy/transactions";

@HelpDoc({
	command: "wallet daily",
	category: HelpCategory.Economy,
	description: "Claim your daily currency reward with streak bonuses (once per 24h)",
	usage: "/wallet daily",
	notes: "Streak bonuses increase your reward the more consecutive days you claim.",
})
@Declare({
	name: "daily",
	description: "🎁 Claim your daily currency reward (once per 24h)",
})
export default class WalletDailySubcommand extends SubCommand {
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

		const accountService = economyAccountService;
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
						"Your account has restrictions. You cannot claim daily.",
					),
				],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// Use the new dynamic daily service
		const payoutResult = await dailyService.processDynamicDailyPayout(
			guildId,
			userId,
		);
		if (payoutResult.isErr()) {
			await ctx.write({
				embeds: [
					buildErrorEmbed(
						`Could not grant daily: ${payoutResult.error.message}`,
					),
				],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const payout = payoutResult.unwrap();
		if (!payout.granted) {
			if (payout.reason === "cooldown") {
				const cooldownText = payout.cooldownEndsAt
					? `You can claim again <t:${Math.floor(payout.cooldownEndsAt.getTime() / 1000)}:R>.`
					: "You already claimed your daily today.";

				await ctx.write({
					embeds: [
						buildEconomyInfoEmbed({
							title: "Daily Cooldown",
							emoji: "⏳",
							description: `${cooldownText}\n\n💡 Come back later to continue your streak!`,
						}),
					],
					flags: MessageFlags.Ephemeral,
				});
			} else {
				await ctx.write({
					embeds: [buildErrorEmbed("Something went wrong. Try again later.")],
					flags: MessageFlags.Ephemeral,
				});
			}
			return;
		}

		const currencyObj = currencyRegistry.get(payout.currencyId);
		const display = (n: number) =>
			currencyObj?.displayAmount(n) ?? `${n} ${payout.currencyId}`;

		const embed = buildDailyClaimEmbed({
			amount: payout.baseMint + payout.bonusFromTreasury,
			streak: payout.streak,
			bestStreak: payout.bestStreak,
			streakBonus: payout.streakBonus,
			fee: payout.fee,
			netAmount: payout.totalPaid,
			currencyId: payout.currencyId,
			display,
			balanceBefore: payout.userBalanceBefore,
			balanceAfter: payout.userBalanceAfter,
			correlationId: payout.correlationId,
			levelUp: payout.levelUp,
			newLevel: payout.newLevel,
		});

		await ctx.write({ embeds: [embed] });
	}
}
