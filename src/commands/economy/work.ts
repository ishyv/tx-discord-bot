/**
 * Work Command (Phase 3d).
 *
 * Purpose: User claims a repeatable work payout with cooldown + daily cap.
 * Funding: Hybrid payout (Minted Base + Treasury Bonus).
 */

import { Command, type CommandContext, Declare } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import {
	buildErrorEmbed,
	createEconomyAccountService,
	economyAccountRepo,
	guildEconomyService,
	workService,
} from "@/modules/economy";
import {
	buildEconomyInfoEmbed,
	buildEconomyWarningEmbed,
} from "@/modules/economy/account/embeds";
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
		try {
			const guildId = ctx.guildId;
			const userId = ctx.author.id;

			if (!guildId) {
				await ctx.write({
					embeds: [
						buildErrorEmbed("This command can only be used in a server."),
					],
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			const accountService = createEconomyAccountService(economyAccountRepo);
			const ensureResult = await accountService.ensureAccount(userId);
			if (ensureResult.isErr()) {
				await ctx.write({
					embeds: [
						buildErrorEmbed(
							`Could not load your account: ${ensureResult.error.message}`,
						),
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
					embeds: [
						buildErrorEmbed("Economy is not configured for this server."),
					],
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			const config = configResult.unwrap();
			const { workDailyCap } = config.work;

			const payoutResult = await workService.processHybridWorkPayout(
				guildId,
				userId,
			);

			if (payoutResult.isErr()) {
				await ctx.write({
					embeds: [
						buildErrorEmbed(`Work Error: ${payoutResult.error.message}`),
					],
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
							buildEconomyInfoEmbed({
								title: "Work Cooldown",
								emoji: "⏳",
								description: `You already worked recently. Try again in **${remainingMinutes}m**.`,
								fields: [
									{
										name: "Remaining Today",
										value: `${claim.remainingToday}/${workDailyCap}`,
										inline: true,
									},
								],
							}),
						],
						flags: MessageFlags.Ephemeral,
					});
					return;
				}
				if (claim.reason === "cap") {
					await ctx.write({
						embeds: [
							buildEconomyWarningEmbed({
								title: "Daily Cap Reached",
								emoji: "📅",
								message: `You reached the daily work cap (**${workDailyCap}/${workDailyCap}**).\n\n💡 Try again tomorrow!`,
							}),
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
						buildEconomyWarningEmbed({
							title: "Work Failed",
							emoji: "😓",
							message: `You couldn't complete this job.\n\nRemaining today: **${claim.remainingToday}/${workDailyCap}**`,
						}),
					],
				});
				return;
			}

			const currencyObj = currencyRegistry.get(claim.currencyId);
			const display = (n: number) =>
				currencyObj?.display(n as any) ?? `${n} ${claim.currencyId}`;

			const levelUpLine =
				claim.levelUp && claim.newLevel > 0
					? `\n⭐ Level Up: **${claim.newLevel}**`
					: "";

			const embed = buildEconomyInfoEmbed({
				title: "Work Complete",
				emoji: "💼",
				description: `You earned **${display(claim.totalPaid)}**.${levelUpLine}`,
				fields: [
					{
						name: "Balance",
						value: `${display(claim.userBalanceBefore)} → ${display(claim.userBalanceAfter)}`,
						inline: true,
					},
					{
						name: "Remaining Today",
						value: `${claim.remainingToday}/${workDailyCap}`,
						inline: true,
					},
				],
				options: {
					correlationId: claim.correlationId,
					showCorrelationId: true,
				},
			});

			await ctx.write({ embeds: [embed] });
		} catch (error) {
			await ctx.write({
				embeds: [
					buildErrorEmbed(
						`Unexpected Error: ${error instanceof Error ? error.message : String(error)}`,
					),
				],
				flags: MessageFlags.Ephemeral,
			});
		}
	}
}
