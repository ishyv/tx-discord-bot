/**
 * Bank Subcommand (Part of /wallet).
 *
 * Purpose: Display bank breakdown with safety rating.
 * Context: Shows hand/bank distribution and provides advice.
 */

import { Declare, SubCommand, type CommandContext } from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { MessageFlags } from "seyfert/lib/types";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
    economyAccountService,
    buildBankEmbed,
    buildAccessDeniedEmbed,
    buildErrorEmbed,
    getBankSafetyRating,
    EconomyError,
} from "@/modules/economy";

// Service instance
const economyService = economyAccountService;

@HelpDoc({
    command: "wallet bank",
    category: HelpCategory.Economy,
    description: "Show the breakdown of your coins in hand vs. bank with a safety rating",
    usage: "/wallet bank",
})
@Declare({
    name: "bank",
    description: "🏦 Show the breakdown of your coins in hand and bank",
})
@BindDisabled(Features.Economy)
@Cooldown({
    type: CooldownType.User,
    interval: 3000,
    uses: { default: 1 },
})
export default class WalletBankSubcommand extends SubCommand {
    async run(ctx: CommandContext) {
        const userId = ctx.author.id;

        // Check access
        const accessResult = await economyService.checkAccess(userId);
        if (accessResult.isErr()) {
            await ctx.write({
                embeds: [buildErrorEmbed("Error verifying access.")],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const access = accessResult.unwrap();
        if (!access.allowed) {
            await ctx.write({
                embeds: [buildAccessDeniedEmbed((access.status as any) ?? "blocked")],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Get bank breakdown
        const result = await economyService.getBankBreakdown(userId);

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
                embeds: [buildErrorEmbed("Could not load your banking information.")],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const view = result.unwrap();

        // If no coins data, show empty state
        if (!view) {
            await ctx.write({
                embeds: [
                    buildBankEmbed(
                        {
                            hand: 0,
                            bank: 0,
                            total: 0,
                            percentInBank: 0,
                            percentInHand: 0,
                            isEmpty: true,
                        },
                        ctx.author.username,
                        ctx.author.avatarURL(),
                    ),
                ],
            });
            return;
        }

        const embed = buildBankEmbed(
            view,
            ctx.author.username,
            ctx.author.avatarURL(),
        );

        // Add safety rating if not empty
        if (!view.isEmpty) {
            const rating = getBankSafetyRating(view.percentInBank);
            embed.addFields({
                name: `${rating.emoji} Safety: ${rating.rating}`,
                value: rating.advice,
                inline: false,
            });
        }

        await ctx.write({ embeds: [embed] });
    }
}
