/**
 * Process Subcommand (Part of /rpg).
 *
 * Purpose: Process raw materials into refined materials.
 * Context: RPG crafting system - 2 raw -> 1 processed with success chance.
 * Note: This replaces the standalone /process command.
 */

import {
    Declare,
    SubCommand,
    Options,
    createStringOption,
    createIntegerOption,
    type GuildCommandContext,
} from "seyfert";
import { BindDisabled, Features } from "@/modules/features";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { getItemDefinition } from "@/modules/inventory/items";
import { rpgProcessingService } from "@/modules/rpg/processing/service";
import { rpgProfileService } from "@/modules/rpg/profile/service";
import {
    canProcessMaterial,
    getProcessedMaterial,
    listProcessableMaterials,
} from "@/modules/rpg/processing/recipes";

// Build choices from processable materials
const materialChoices = listProcessableMaterials()
    .map((id) => ({
        id,
        def: getItemDefinition(id),
    }))
    .filter((entry) => !!entry.def)
    .map((entry) => ({
        name: entry.def!.name,
        value: entry.id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

const options = {
    material: createStringOption({
        description: "Raw material to process",
        required: true,
        choices: materialChoices,
    }),
    quantity: createIntegerOption({
        description: "Quantity to process (will round down to pairs)",
        required: false,
        min_value: 2,
        max_value: 100,
    }),
};

@HelpDoc({
    command: "rpg process",
    category: HelpCategory.RPG,
    description: "Process raw materials into refined materials (2 raw → 1 processed) for crafting",
    usage: "/rpg process <material> [quantity]",
    examples: ["/rpg process raw_wood 10"],
    notes: "Processing has a success chance. Refined materials are required for higher-tier crafting.",
})
@Declare({
    name: "process",
    description: "⚗️ Process raw materials into refined materials (2 raw -> 1 processed)",
})
@BindDisabled(Features.Economy)
@Cooldown({
    type: CooldownType.User,
    interval: 30000,
    uses: { default: 1 },
})
@Options(options)
export default class RpgProcessSubcommand extends SubCommand {
    async run(ctx: GuildCommandContext<typeof options>) {
        const { material: rawMaterialId, quantity = 2 } = ctx.options;
        const userId = ctx.author.id;
        const guildId = ctx.guildId ?? undefined;

        // Economy gating - if this succeeds, user can use RPG
        const gateResult = await rpgProfileService.ensureAndGate(userId, guildId);
        if (gateResult.isErr()) {
            await ctx.write({
                content: `❌ ${gateResult.error.message}`,
                flags: 64,
            });
            return;
        }

        // Validate material can be processed
        if (!canProcessMaterial(rawMaterialId)) {
            await ctx.write({
                content: "❌ This material cannot be processed.",
                flags: 64,
            });
            return;
        }

        const outputId = getProcessedMaterial(rawMaterialId);
        const rawName = getItemDefinition(rawMaterialId)?.name ?? rawMaterialId;
        const outputName = outputId
            ? (getItemDefinition(outputId)?.name ?? outputId)
            : "unknown";

        // Defer reply since processing may take time
        await ctx.deferReply();

        const result = await rpgProcessingService.process({
            userId,
            guildId,
            rawMaterialId,
            quantity,
            actorId: userId,
        });

        if (result.isErr()) {
            const error = result.error;
            let message = "❌ ";

            switch (error.code) {
                case "PROFILE_NOT_FOUND":
                    message += "You need an RPG profile first! Use `/rpg profile` to create one.";
                    break;
                case "INSUFFICIENT_MATERIALS":
                    message += error.message;
                    break;
                case "INSUFFICIENT_FUNDS":
                    message += error.message;
                    break;
                case "PROCESSING_FAILED":
                    message += error.message;
                    break;
                default:
                    message += error.message;
            }

            await ctx.editOrReply({ content: message });
            return;
        }

        const proc = result.unwrap();

        // Build response
        let response = `⚗️ **Processing ${rawName}**\n\n`;

        // Input/Output summary
        response += `📥 Input: ${proc.materialsConsumed}x ${rawName}\n`;
        response += `📤 Output: ${proc.outputGained}x ${outputName}\n\n`;

        // Results breakdown
        const successRate = Math.round(proc.successChance * 100);
        response += `📊 Results:\n`;
        response += `• Attempts: ${proc.batchesAttempted}\n`;
        response += `• Successes: ${proc.batchesSucceeded} ✅\n`;
        response += `• Failures: ${proc.batchesFailed} ❌\n`;
        response += `• Success chance: ${successRate}%\n\n`;

        // Economics
        response += `💰 Fee paid: ${proc.feePaid} coins\n`;

        // Net yield
        const netYield = proc.outputGained - proc.batchesFailed; // Simple metric
        if (netYield > 0) {
            response += `\n✨ Net yield: +${netYield} materials`;
        } else if (netYield < 0) {
            response += `\n💸 Net loss: ${netYield} materials`;
        } else {
            response += `\n⚖️ Broke even`;
        }

        await ctx.editOrReply({ content: response });
    }
}
