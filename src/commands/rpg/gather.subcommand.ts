/**
 * Gather Subcommand (Part of /rpg).
 *
 * Purpose: Gather resources (wood or ore) from locations.
 * Context: Merges /cutdown and /mine into a single unified command.
 */

import {
    Declare,
    SubCommand,
    Options,
    createStringOption,
    type GuildCommandContext,
} from "seyfert";
import { BindDisabled, Features } from "@/modules/features";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { rpgGatheringService } from "@/modules/rpg/gathering/service";
import { rpgProfileService } from "@/modules/rpg/profile/service";
import { getLocation, listLocations } from "@/modules/rpg/gathering/definitions";
import { getItemDefinition } from "@/modules/inventory/items";

// Build location choices for both resource types
const forestLocations = listLocations("forest").map((l) => ({
    name: `🌲 ${l.name} (Tier ${l.requiredTier})`,
    value: `forest:${l.id}`,
}));

const mineLocations = listLocations("mine").map((l) => ({
    name: `⛏️ ${l.name} (Tier ${l.requiredTier})`,
    value: `mine:${l.id}`,
}));

const allLocations = [...forestLocations, ...mineLocations];

const options = {
    location: createStringOption({
        description: "Gathering location (forest or mine)",
        required: true,
        choices: allLocations,
    }),
};

@HelpDoc({
    command: "rpg gather",
    category: HelpCategory.RPG,
    description: "Gather wood or ore from locations to use in crafting",
    usage: "/rpg gather <resource> <location>",
    examples: ["/rpg gather wood forest:pine_grove", "/rpg gather ore mine:copper_mine"],
    notes: "Higher-tier locations require better tools. Resources are used in crafting.",
})
@Declare({
    name: "gather",
    description: "🌲⛏️ Gather wood or ore from locations",
})
@BindDisabled(Features.Economy)
@Cooldown({
    type: CooldownType.User,
    interval: 60000,
    uses: { default: 1 },
})
@Options(options)
export default class RpgGatherSubcommand extends SubCommand {
    async run(ctx: GuildCommandContext<typeof options>) {
        const { location: locationInput } = ctx.options;
        const userId = ctx.author.id;
        const guildId = ctx.guildId ?? undefined;

        // Parse location type and ID
        const [locationType, locationId] = locationInput.split(":");
        const isForest = locationType === "forest";

        // Economy gating - if this succeeds, user can use RPG
        const gateResult = await rpgProfileService.ensureAndGate(userId, guildId);
        if (gateResult.isErr()) {
            await ctx.write({
                content: `❌ ${gateResult.error.message}`,
                flags: 64,
            });
            return;
        }

        // Defer reply since this may take time
        await ctx.deferReply();

        // Call appropriate gathering service method
        const result = isForest
            ? await rpgGatheringService.cutdown(userId, locationId, userId, guildId)
            : await rpgGatheringService.mine(userId, locationId, userId, guildId);

        if (result.isErr()) {
            const error = result.error;
            let message = "❌ ";

            const toolName = isForest ? "axe" : "pickaxe";

            switch (error.code) {
                case "PROFILE_NOT_FOUND":
                    message += "You need an RPG profile first! Use `/rpg profile` to create one.";
                    break;
                case "NO_TOOL_EQUIPPED":
                    message += `You need to equip a ${toolName} first! Use \`/rpg equipment\``;
                    break;
                case "INVALID_EQUIPMENT_SLOT":
                    message += `You need to equip a ${toolName}! Use \`/rpg equipment\``;
                    break;
                case "INSUFFICIENT_TOOL_TIER":
                    message += error.message;
                    break;
                case "LOCATION_NOT_FOUND":
                    message += "That location doesn't exist!";
                    break;
                case "TOOL_BROKEN":
                    message += `Your ${toolName} broke! You'll need to equip a new one.`;
                    break;
                default:
                    message += error.message;
            }

            await ctx.editOrReply({
                content: message,
            });
            return;
        }

        const gather = result.unwrap();
        const location = getLocation(locationId)!;
        const materialName =
            getItemDefinition(gather.materialsGained[0]!.id)?.name ??
            gather.materialsGained[0]!.id;

        const toolName = isForest ? "axe" : "pickaxe";
        const toolEmoji = isForest ? "🪓" : "⛏️";
        const resourceEmoji = isForest ? "🪵" : "💎";
        const actionTitle = isForest ? "Cutting" : "Mining";

        // Build response
        let response = `${toolEmoji} **${actionTitle} at ${location.name}**\n\n`;

        // Yield
        const qty = gather.materialsGained[0]!.quantity;
        response += `${resourceEmoji} Harvested: **${qty}x ${materialName}**\n`;

        // Tool status
        if (gather.toolBroken) {
            response += `\n💔 Your ${toolName} **broke**!`;
        } else {
            const durabilityBar = this.renderDurabilityBar(gather.remainingDurability);
            response += `\n${toolEmoji} ${toolName.charAt(0).toUpperCase() + toolName.slice(1)} durability: ${durabilityBar} (${gather.remainingDurability} left)`;
        }

        await ctx.editOrReply({ content: response });
    }

    private renderDurabilityBar(durability: number): string {
        const maxDurability = 10; // Approximate for display
        const filled = Math.max(0, Math.min(10, Math.ceil((durability / maxDurability) * 10)));
        const empty = 10 - filled;
        return "█".repeat(filled) + "░".repeat(empty);
    }
}
