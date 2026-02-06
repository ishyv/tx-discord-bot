/**
 * RPG Onboarding Button Handler.
 *
 * Purpose: Handle Miner/Lumber path selection buttons.
 * Context: Triggered when a user clicks a starter kit path button.
 */

import { ComponentCommand, type ComponentContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { onboardingService } from "@/modules/rpg/onboarding/service";
import type { StarterPath } from "@/modules/rpg/onboarding/types";
import {
    ONBOARDING_BUTTON_IDS,
    createStarterKitClaimedEmbed,
    createOnboardingErrorEmbed,
    createAlreadyClaimedEmbed,
} from "@/modules/rpg/onboarding/views";

export default class RpgOnboardingButtonHandler extends ComponentCommand {
    componentType = "Button" as const;

    filter(ctx: ComponentContext<"Button">) {
        return (
            ctx.customId === ONBOARDING_BUTTON_IDS.MINER ||
            ctx.customId === ONBOARDING_BUTTON_IDS.LUMBER
        );
    }

    async run(ctx: ComponentContext<"Button">) {
        const userId = ctx.author.id;
        const guildId = ctx.guildId;

        if (!guildId) {
            await ctx.write({
                content: "❌ This command only works in servers.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Determine path from button
        const path: StarterPath =
            ctx.customId === ONBOARDING_BUTTON_IDS.MINER ? "miner" : "lumber";

        // Defer to show loading while we grant items
        await ctx.deferUpdate();

        // Claim the starter kit
        const result = await onboardingService.claimStarterKit({
            userId,
            guildId,
            path,
        });

        if (result.isErr()) {
            const error = result.error;

            if (error.code === "ALREADY_CLAIMED") {
                // Show already-claimed message and remove buttons
                await ctx.editOrReply({
                    embeds: [createAlreadyClaimedEmbed(path)],
                    components: [],
                });
                return;
            }

            // Show error message
            await ctx.editOrReply({
                embeds: [createOnboardingErrorEmbed(error.message)],
                components: [],
            });
            return;
        }

        // Success! Show the claimed embed
        const claimResult = result.unwrap();
        const username = ctx.author.username;

        await ctx.editOrReply({
            embeds: [createStarterKitClaimedEmbed(username, claimResult)],
            components: [], // Remove the buttons after claiming
        });
    }
}
