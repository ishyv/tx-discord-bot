/**
 * Vote Command.
 *
 * Purpose: Cast love/hate votes on other users.
 */
import {
	Command,
	createStringOption,
	createUserOption,
	Declare,
	type GuildCommandContext,
	Options,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
	buildErrorEmbed,
	economyAccountService,
	guildEconomyRepo,
} from "@/modules/economy";
import {
	buildEconomyInfoEmbed,
	buildEconomyWarningEmbed,
	buildVoteEmbed,
} from "@/modules/economy/account/embeds";
import { type VoteType, votingService } from "@/modules/economy/voting";
import { BindDisabled, Features } from "@/modules/features";
import { HelpDoc, HelpCategory } from "@/modules/help";

const voteOptions = {
	user: createUserOption({
		description: "User to vote for",
		required: true,
	}),
	type: createStringOption({
		description: "Vote type",
		required: true,
		choices: [
			{ name: "💖 Love", value: "love" },
			{ name: "😤 Hate", value: "hate" },
		],
	}),
};

@HelpDoc({
	command: "vote",
	category: HelpCategory.Economy,
	description: "Cast a love or hate vote on another user to affect their reputation",
	usage: "/vote <user> <type>",
	examples: ["/vote @User love", "/vote @User hate"],
})
@Declare({
	name: "vote",
	description: "Vote for another user (love/hate)",
	contexts: ["Guild"],
	integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
	type: CooldownType.User,
	interval: 3000,
	uses: { default: 1 },
})
@Options(voteOptions)
export default class VoteCommand extends Command {
	async run(ctx: GuildCommandContext<typeof voteOptions>) {
		const guildId = ctx.guildId;
		const voterId = ctx.author.id;
		const target = ctx.options.user;
		const voteType = ctx.options.type as VoteType;

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
			!guildConfigResult.unwrap().features.voting
		) {
			await ctx.write({
				embeds: [buildErrorEmbed("Voting is disabled on this server.")],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (!target) {
			await ctx.write({
				embeds: [buildErrorEmbed("User not found.")],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const targetId = target.id;

		// Self-check
		if (voterId === targetId) {
			await ctx.write({
				embeds: [buildErrorEmbed("You cannot vote for yourself.")],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// Check account
		const accountService = economyAccountService;
		const ensureResult = await accountService.ensureAccount(voterId);
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

		// Check if can vote
		const canVoteResult = await votingService.canVote(
			guildId,
			voterId,
			targetId,
		);
		if (canVoteResult.isOk() && !canVoteResult.unwrap().canVote) {
			const canVote = canVoteResult.unwrap();
			const reason = canVote.reason ?? "You cannot vote right now.";
			const reasonLower = reason.toLowerCase();

			if (reasonLower.includes("cooldown")) {
				const cooldownHint = canVote.cooldownSeconds
					? `\n\nTry again in **${canVote.cooldownSeconds}s**.`
					: "";
				await ctx.write({
					embeds: [
						buildEconomyInfoEmbed({
							title: "Vote Cooldown",
							emoji: "⏳",
							description: `${reason}${cooldownHint}`,
						}),
					],
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			if (reasonLower.includes("daily limit")) {
				await ctx.write({
					embeds: [
						buildEconomyWarningEmbed({
							title: "Daily Limit Reached",
							emoji: "📅",
							message: reason,
						}),
					],
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			await ctx.write({
				embeds: [buildErrorEmbed(reason)],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// Execute vote
		const result = await votingService.castVote({
			guildId,
			voterId,
			targetId,
			type: voteType,
		});

		if (result.isErr()) {
			const error = result.error;
			const messages: Record<string, string> = {
				SELF_VOTE: "You cannot vote for yourself.",
				TARGET_BLOCKED: "The target has restrictions.",
				TARGET_BANNED: "The target is banned.",
				TARGET_OPTED_OUT: "The user does not accept votes.",
				TARGET_IS_BOT: "You cannot vote for bots.",
				COOLDOWN_ACTIVE: "Wait before voting again.",
				REPEAT_COOLDOWN: "You must wait before voting for this user again.",
				DAILY_LIMIT_REACHED: "You have reached the daily vote limit.",
				SAME_VOTE_TYPE: "You already voted this way for this user.",
				VOTING_DISABLED: "The voting system is disabled.",
				FEATURE_DISABLED: "Voting is disabled on this server.",
			};

			if (
				error.code === "COOLDOWN_ACTIVE" ||
				error.code === "REPEAT_COOLDOWN"
			) {
				await ctx.write({
					embeds: [
						buildEconomyInfoEmbed({
							title: "Vote Cooldown",
							emoji: "⏳",
							description: messages[error.code] ?? error.message,
						}),
					],
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			if (error.code === "DAILY_LIMIT_REACHED") {
				await ctx.write({
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

			await ctx.write({
				embeds: [buildErrorEmbed(messages[error.code] ?? error.message)],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const vote = result.unwrap();

		const embed = buildVoteEmbed({
			type: voteType,
			targetId,
			loveCount: vote.targetStats.loveCount,
			hateCount: vote.targetStats.hateCount,
			correlationId: vote.correlationId,
		});

		await ctx.write({
			embeds: [embed],
			flags: MessageFlags.Ephemeral,
		});
	}
}
