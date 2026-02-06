/**
 * RPG Onboarding Views.
 *
 * Purpose: Embed and component builders for the onboarding flow.
 * Context: Used by profile command when user needs onboarding.
 */

import { Embed, ActionRow, Button } from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";
import { UIColors } from "@/modules/ui/design-system";
import { getItemDefinition } from "@/modules/inventory/items";
import type { StarterKitDefinition, StarterKitItem } from "@/modules/rpg/config/types";
import type { ClaimStarterKitResult, GrantedItem } from "./types";

/** Custom IDs for onboarding buttons. */
export const ONBOARDING_BUTTON_IDS = {
    MINER: "rpg_onboard_miner",
    LUMBER: "rpg_onboard_lumber",
} as const;

/** Build the onboarding welcome embed. */
export function createOnboardingEmbed(
    username: string,
    minerKit: StarterKitDefinition,
    lumberKit: StarterKitDefinition,
): Embed {
    const minerToolDef = getItemDefinition(minerKit.toolId);
    const lumberToolDef = getItemDefinition(lumberKit.toolId);

    const minerGearList = minerKit.gear
        .map((g: StarterKitItem) => {
            const def = getItemDefinition(g.id);
            return `  • ${def?.emoji ?? "📦"} ${def?.name ?? g.id} x${g.qty}`;
        })
        .join("\n");

    const lumberGearList = lumberKit.gear
        .map((g: StarterKitItem) => {
            const def = getItemDefinition(g.id);
            return `  • ${def?.emoji ?? "📦"} ${def?.name ?? g.id} x${g.qty}`;
        })
        .join("\n");

    return new Embed()
        .setTitle("⚔️ Welcome to the RPG Adventure!")
        .setDescription(
            `Hey **${username}**, it looks like you're new here!\n\n` +
            `Choose a **starter path** to begin your journey. Each path grants you a beginner tool and some basic gear.\n\n` +
            `You can only choose once, so pick wisely!`,
        )
        .setColor(UIColors.gold)
        .addFields(
            {
                name: `⛏️ Miner Path`,
                value:
                    `**Tool:** ${minerToolDef?.emoji ?? ""} ${minerToolDef?.name ?? minerKit.toolId}\n` +
                    `**Gear:**\n${minerGearList || "  *None*"}\n\n` +
                    `*Mine ores and craft metal equipment.*`,
                inline: true,
            },
            {
                name: `🪓 Lumber Path`,
                value:
                    `**Tool:** ${lumberToolDef?.emoji ?? ""} ${lumberToolDef?.name ?? lumberKit.toolId}\n` +
                    `**Gear:**\n${lumberGearList || "  *None*"}\n\n` +
                    `*Cut down trees and craft wooden items.*`,
                inline: true,
            },
        )
        .setFooter({ text: "Click a button below to claim your starter kit!" });
}

/** Build the onboarding action buttons. */
export function createOnboardingButtons(): ActionRow<Button> {
    return new ActionRow<Button>().addComponents(
        new Button()
            .setCustomId(ONBOARDING_BUTTON_IDS.MINER)
            .setLabel("⛏️ Miner Path")
            .setStyle(ButtonStyle.Primary),
        new Button()
            .setCustomId(ONBOARDING_BUTTON_IDS.LUMBER)
            .setLabel("🪓 Lumber Path")
            .setStyle(ButtonStyle.Success),
    );
}

/** Format a granted item for display. */
function formatGrantedItem(item: GrantedItem): string {
    const def = getItemDefinition(item.itemId);
    const emoji = def?.emoji ?? "📦";
    const name = def?.name ?? item.itemId;
    const qty = item.qty > 1 ? ` x${item.qty}` : "";
    const tag = item.isTool ? " ⭐" : "";
    return `${emoji} **${name}**${qty}${tag}`;
}

/** Build the success embed after claiming a starter kit. */
export function createStarterKitClaimedEmbed(
    username: string,
    result: ClaimStarterKitResult,
): Embed {
    const pathEmoji = result.path === "miner" ? "⛏️" : "🪓";
    const pathName = result.path === "miner" ? "Miner" : "Lumber";

    const itemList = result.grantedItems.map(formatGrantedItem).join("\n");

    return new Embed()
        .setTitle(`${pathEmoji} ${pathName} Path Chosen!`)
        .setDescription(
            `Congratulations **${username}**, you've chosen the **${pathName}** path!\n\n` +
            `Your starter kit has been added to your inventory:`,
        )
        .setColor(UIColors.success)
        .addFields({
            name: "📦 Received Items",
            value: itemList || "*No items*",
            inline: false,
        })
        .setFooter({
            text: `Use /rpg ${result.path === "miner" ? "mine" : "cutdown"} to start gathering! • ID: ${result.correlationId}`,
        });
}

/** Build an error embed for onboarding failures. */
export function createOnboardingErrorEmbed(
    errorMessage: string,
): Embed {
    return new Embed()
        .setTitle("❌ Onboarding Failed")
        .setDescription(errorMessage)
        .setColor(UIColors.error);
}

/** Build an already-claimed embed. */
export function createAlreadyClaimedEmbed(
    existingPath: string,
): Embed {
    const pathEmoji = existingPath === "miner" ? "⛏️" : "🪓";
    const pathName = existingPath === "miner" ? "Miner" : "Lumber";

    return new Embed()
        .setTitle(`${pathEmoji} Already Onboarded`)
        .setDescription(
            `You already claimed a starter kit with the **${pathName}** path.\n\n` +
            `Use \`/rpg profile\` to view your progress!`,
        )
        .setColor(UIColors.warning);
}
