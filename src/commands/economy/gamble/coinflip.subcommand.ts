/**
 * Coinflip Subcommand (Part of /gamble).
 *
 * Purpose: Bet on a coin flip with heads or tails.
 * Context: Simple 50/50 gambling game with house edge.
 */
import {
	createIntegerOption,
	createStringOption,
	Declare,
	type GuildCommandContext,
	Options,
	SubCommand,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
	buildErrorEmbed,
	createEconomyAccountService,
	economyAccountRepo,
	guildEconomyRepo,
} from "@/modules/economy";
import {
	buildCoinflipEmbed,
	buildEconomyInfoEmbed,
	buildEconomyWarningEmbed,
} from "@/modules/economy/account/embeds";
import {
	type CoinSide,
	minigameRepo,
	minigameService,
} from "@/modules/economy/minigames";
import { currencyRegistry } from "@/modules/economy/transactions";
import { BindDisabled, Features } from "@/modules/features";

const coinflipOptions = {
	amount: createIntegerOption({
		description: "Amount to bet",
		required: true,
		min_value: 1,
	}),
	choice: createStringOption({
		description: "Heads or tails",
		required: true,
		choices: [
			{ name: "🪙 Heads", value: "heads" },
			{ name: "📀 Tails", value: "tails" },
		],
	}),
};

@Declare({
	name: "coinflip",
	description: "🪙 Bet on a coin flip",
})
@BindDisabled(Features.Economy)
@Cooldown({
	type: CooldownType.User,
	interval: 5000,
	uses: { default: 1 },
})
@Options(coinflipOptions)
export default class GambleCoinflipSubcommand extends SubCommand {
	async run(ctx: GuildCommandContext<typeof coinflipOptions>) {
		const guildId = ctx.guildId;
		const userId = ctx.author.id;

		if (!guildId) {
			await ctx.write({
				embeds: [buildErrorEmbed("This command only works in servers.")],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// Check feature flag
		const guildConfigResult = await guildEconomyRepo.ensure(guildId);
		if (
			guildConfigResult.isOk() &&
			!guildConfigResult.unwrap().features.coinflip
		) {
			await ctx.write({
				embeds: [buildErrorEmbed("Coinflip is disabled in this server.")],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const amount = ctx.options.amount;
		const choice = ctx.options.choice as CoinSide;

		// Validate amount
		if (amount < 1) {
			await ctx.write({
				embeds: [buildErrorEmbed("The bet must be at least 1.")],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// Check account
		const accountService = createEconomyAccountService(economyAccountRepo);
		const ensureResult = await accountService.ensureAccount(userId);
		if (ensureResult.isErr()) {
			await ctx.write({
				embeds: [buildErrorEmbed("Could not access your account.")],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const { account } = ensureResult.unwrap();
		if (account.status !== "ok") {
			await ctx.write({
				embeds: [buildErrorEmbed("Your account has restrictions.")],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// Get config for validation
		const configResult = await minigameRepo.getCoinflipConfig(guildId);
		let currencyId = "coin";
		if (configResult.isOk()) {
			const config = configResult.unwrap();
			currencyId = config.currencyId;
			if (amount > config.maxBet) {
				await ctx.write({
					embeds: [
						buildErrorEmbed(
							`Maximum bet: ${config.maxBet} ${config.currencyId}\n\n💡 Try a smaller bet.`,
						),
					],
					flags: MessageFlags.Ephemeral,
				});
				return;
			}
		}

		// Execute coinflip
		const result = await minigameService.coinflip({
			guildId,
			userId,
			amount,
			choice,
		});

		if (result.isErr()) {
			const error = result.error;
			const messages: Record<string, string> = {
				INSUFFICIENT_FUNDS: "You don't have enough balance.",
				BET_TOO_LOW: "Bet is too low.",
				BET_TOO_HIGH: "Bet is too high.",
				COOLDOWN_ACTIVE: "Wait before betting again.",
				DAILY_LIMIT_REACHED: "You've reached the daily bet limit.",
				CONFIG_NOT_FOUND: "Coinflip is not available.",
				INVALID_CHOICE: "Choose heads or tails.",
				FEATURE_DISABLED: "Coinflip is disabled in this server.",
			};

			if (error.code === "COOLDOWN_ACTIVE") {
				await ctx.editOrReply({
					embeds: [
						buildEconomyInfoEmbed({
							title: "Coinflip Cooldown",
							emoji: "⏳",
							description: messages[error.code] ?? error.message,
						}),
					],
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			if (error.code === "DAILY_LIMIT_REACHED") {
				await ctx.editOrReply({
					embeds: [
						buildEconomyWarningEmbed({
							title: "Daily Limit Reached",
							emoji: "📅",
							message: messages[error.code] ?? error.message,
						}),
					],
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			await ctx.editOrReply({
				embeds: [buildErrorEmbed(messages[error.code] ?? error.message)],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const game = result.unwrap();
		const currencyObj = currencyRegistry.get(currencyId);
		const display = (n: number) =>
			currencyObj?.display(n as any) ?? `${n} ${currencyId}`;

		const embed = buildCoinflipEmbed({
			won: game.won,
			amount: game.amount,
			choice: game.choice === "heads" ? "🪙 Heads" : "📀 Tails",
			outcome: game.outcome === "heads" ? "🪙 Heads" : "📀 Tails",
			winnings: game.winnings,
			houseFee: game.houseFee,
			netProfit: game.netProfit,
			newBalance: game.newBalance,
			display,
			correlationId: game.correlationId,
		});

		await ctx.editOrReply({
			embeds: [embed],
			flags: MessageFlags.Ephemeral,
		});
	}
}
