/**
 * Upgrade Subcommand (Part of /rpg).
 *
 * Purpose: Upgrade a tool to the next tier with materials and money.
 * Context: RPG upgrade system - tool tier progression 1-4.
 * Note: This replaces the standalone /upgrade-tool command.
 */

import {
    Declare,
    SubCommand,
    Options,
    createStringOption,
    createBooleanOption,
    type GuildCommandContext,
} from "seyfert";
import { BindDisabled, Features } from "@/modules/features";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { rpgUpgradeService } from "@/modules/rpg/upgrades/service";
import { rpgGatheringService } from "@/modules/rpg/gathering/service";
import { rpgProfileService } from "@/modules/rpg/profile/service";
import { parseToolTier, getUpgradeCost } from "@/modules/rpg/upgrades/definitions";
import { UPGRADE_CONFIG } from "@/modules/rpg/config";
import { ITEM_DEFINITIONS } from "@/modules/inventory/definitions";
import { normalizeModernInventory } from "@/modules/inventory/inventory";
import { buildInventoryView } from "@/modules/inventory/instances";
import { UserStore } from "@/db/repositories/users";

const options = {
    instance: createStringOption({
        description: "Instance ID of the tool to upgrade (shown in inventory)",
        required: false,
    }),
    equipped: createBooleanOption({
        description: "Upgrade the currently equipped tool",
        required: false,
    }),
};

@HelpDoc({
    command: "rpg upgrade",
    category: HelpCategory.RPG,
    description: "Upgrade a tool to the next tier using materials and coins",
    usage: "/rpg upgrade [instance] [equipped]",
    examples: ["/rpg upgrade equipped:true"],
    notes: "Tools have 4 tiers. Higher tiers gather more resources and access better locations.",
})
@Declare({
    name: "upgrade",
    description: "⬆️ Upgrade a tool to the next tier",
})
@BindDisabled(Features.Economy)
@Cooldown({
    type: CooldownType.User,
    interval: 60000,
    uses: { default: 1 },
})
@Options(options)
export default class RpgUpgradeSubcommand extends SubCommand {
    async run(ctx: GuildCommandContext<typeof options>) {
        const { instance: instanceId, equipped: useEquipped } = ctx.options;
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

        await ctx.deferReply();

        // Get user data
        const userResult = await UserStore.get(userId);
        if (userResult.isErr() || !userResult.unwrap()) {
            await ctx.editOrReply({
                content: "❌ You need an RPG profile first! Use `/rpg profile` to create one.",
            });
            return;
        }

        const user = userResult.unwrap()!;
        const inventory = normalizeModernInventory(user.inventory);

        // Determine which tool to upgrade
        let toolId: string | undefined;
        let selectedInstanceId = instanceId;

        if (useEquipped) {
            // Get equipped tool
            const equippedResult = await rpgGatheringService.getEquippedTool(userId);
            if (!equippedResult) {
                await ctx.editOrReply({
                    content: "❌ You don't have a tool equipped! Use `/rpg equipment` to equip one, or provide an instance ID.",
                });
                return;
            }
            toolId = equippedResult.itemId;
            selectedInstanceId = equippedResult.instanceId;
        } else if (instanceId) {
            // Find tool by instance ID
            for (const [itemId, entry] of Object.entries(inventory)) {
                if (entry?.type === "instances") {
                    const instance = entry.instances.find(i => i.instanceId === instanceId);
                    if (instance) {
                        toolId = itemId;
                        break;
                    }
                }
            }
            if (!toolId) {
                await ctx.editOrReply({
                    content: `❌ Could not find a tool with instance ID \`${instanceId}\`. Use \`/inventory\` to see your tool instances.`,
                });
                return;
            }
        } else {
            // Show help with available tools
            await this.showUpgradeHelp(ctx, userId, inventory);
            return;
        }

        // Get upgrade preview
        const previewResult = await rpgUpgradeService.getUpgradePreview(userId, toolId, selectedInstanceId);
        if (previewResult.isErr()) {
            await ctx.editOrReply({
                content: `❌ ${previewResult.error.message}`,
            });
            return;
        }

        const preview = previewResult.unwrap();

        // Check if can upgrade
        if (!preview.canUpgrade) {
            const embed = this.createErrorEmbed(preview);
            await ctx.editOrReply({ embeds: [embed] });
            return;
        }

        // Perform upgrade
        const upgradeResult = await rpgUpgradeService.upgrade({
            userId,
            guildId,
            toolId,
            instanceId: selectedInstanceId,
            actorId: userId,
        });

        if (upgradeResult.isErr()) {
            const error = upgradeResult.error;
            let message = "❌ ";

            switch (error.code) {
                case "PROFILE_NOT_FOUND":
                    message += "You need an RPG profile first! Use `/rpg profile` to create one.";
                    break;
                case "IN_COMBAT":
                    message += "You cannot upgrade tools while in combat!";
                    break;
                case "MAX_TIER_REACHED":
                    message += "This tool is already at maximum tier (4)!";
                    break;
                case "INSUFFICIENT_MATERIALS":
                    message += error.message;
                    break;
                case "INSUFFICIENT_FUNDS":
                    message += error.message;
                    break;
                case "INSTANCE_NOT_FOUND":
                    message += "That tool instance was not found. It may have been consumed or broken.";
                    break;
                default:
                    message += error.message;
            }

            await ctx.editOrReply({ content: message });
            return;
        }

        const result = upgradeResult.unwrap();
        const embed = this.createSuccessEmbed(result, preview);
        await ctx.editOrReply({ embeds: [embed] });
    }

    private async showUpgradeHelp(
        ctx: GuildCommandContext<typeof options>,
        userId: string,
        inventory: ReturnType<typeof normalizeModernInventory>,
    ): Promise<void> {
        // Find all upgradable tools
        const view = buildInventoryView(inventory);
        const tools = view.filter((entry: { itemId: string; isInstanceBased: boolean; instances?: Array<{ instanceId: string; durability: number }> }) => {
            if (!entry.isInstanceBased) return false;
            const def = ITEM_DEFINITIONS[entry.itemId];
            return def?.tool !== undefined;
        });

        if (tools.length === 0) {
            await ctx.editOrReply({
                content: "❌ You don't have any tools to upgrade! Tools can be crafted or purchased.",
            });
            return;
        }

        // Get equipped tool
        const equippedResult = await rpgGatheringService.getEquippedTool(userId);
        const equippedInstanceId = equippedResult?.instanceId;

        let content = "🔧 **Tool Upgrade**\n\n";
        content += "Upgrade your tools to higher tiers for better gathering yields!\n\n";

        // List available tools
        content += "**Your Tools:**\n";
        for (const tool of tools) {
            const def = ITEM_DEFINITIONS[tool.itemId];
            const tier = parseToolTier(tool.itemId);
            const maxTier = UPGRADE_CONFIG.maxTier;

            for (const instance of tool.instances ?? []) {
                const isEquipped = instance.instanceId === equippedInstanceId;
                const canUpgrade = tier < maxTier;
                const upgradeInfo = canUpgrade ? getUpgradeCost(tier + 1) : null;

                content += `• \`${instance.instanceId}\` **${def?.name ?? tool.itemId}** (Tier ${tier}/${maxTier})`;
                if (isEquipped) content += " [Equipped]";
                content += "\n";

                if (canUpgrade && upgradeInfo) {
                    const matStr = upgradeInfo.materials.map(m => `${m.qty}x ${ITEM_DEFINITIONS[m.id]?.name ?? m.id}`).join(", ");
                    content += `  → Upgrade to T${tier + 1}: ${upgradeInfo.money.toLocaleString()} coins + ${matStr}\n`;
                } else if (!canUpgrade) {
                    content += `  → Max tier reached\n`;
                }
            }
        }

        content += "\n**Usage:**\n";
        content += "• `/rpg upgrade equipped:true` - Upgrade your equipped tool\n";
        content += "• `/rpg upgrade instance:<id>` - Upgrade a specific tool by instance ID\n";

        await ctx.editOrReply({ content });
    }

    private createErrorEmbed(preview: {
        toolId: string;
        currentTier: number;
        nextTier: number;
        canUpgrade: boolean;
        reason?: string;
        cost: {
            money: number;
            materials: Array<{ id: string; quantity: number }>;
        };
    }): object {
        const def = ITEM_DEFINITIONS[preview.toolId];
        const title = def?.name ?? preview.toolId;

        return {
            title: "❌ Cannot Upgrade Tool",
            description: `**${title}** (Tier ${preview.currentTier})\n\n${preview.reason ?? "Unknown reason"}`,
            color: 0xff0000,
            fields: [
                {
                    name: "Target",
                    value: `Tier ${preview.nextTier}`,
                    inline: true,
                },
                {
                    name: "Cost",
                    value: `${preview.cost.money.toLocaleString()} coins`,
                    inline: true,
                },
                {
                    name: "Materials",
                    value: preview.cost.materials.length > 0
                        ? preview.cost.materials.map(m => `${m.quantity}x ${ITEM_DEFINITIONS[m.id]?.name ?? m.id}`).join("\n")
                        : "None",
                    inline: false,
                },
            ],
        };
    }

    private createSuccessEmbed(
        result: {
            originalToolId: string;
            newToolId: string;
            newTier: number;
            moneySpent: number;
            materialsConsumed: Array<{ id: string; quantity: number }>;
        },
        preview: {
            durability: {
                current: number;
                max: number;
                newMax: number;
            };
        },
    ): object {
        const originalDef = ITEM_DEFINITIONS[result.originalToolId];
        const newDef = ITEM_DEFINITIONS[result.newToolId];
        const originalName = originalDef?.name ?? result.originalToolId;
        const newName = newDef?.name ?? result.newToolId;

        return {
            title: "⬆️ Tool Upgrade Complete!",
            description: [
                `**${originalName}** → **${newName}**`,
                "",
                `✨ **New Tier:** ${result.newTier}`,
                `🔧 **Durability:** ${preview.durability.newMax} (full)`,
                "",
                "💰 **Cost:**",
                `• ${result.moneySpent.toLocaleString()} coins`,
                ...result.materialsConsumed.map(m => `• ${m.quantity}x ${ITEM_DEFINITIONS[m.id]?.name ?? m.id}`),
            ].join("\n"),
            color: 0x00ff00,
        };
    }
}
