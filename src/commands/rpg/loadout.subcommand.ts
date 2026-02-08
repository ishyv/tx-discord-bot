/**
 * Loadout Subcommand (Part of /rpg).
 *
 * Purpose: View your current equipment and loadout with stat totals.
 * Context: Shows equipped items, calculated stats, and durability.
 * Note: This replaces the standalone /rpg-loadout command.
 */
import {
    Declare,
    SubCommand,
    Options,
    type GuildCommandContext,
    createUserOption,
    Embed,
} from "seyfert";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { rpgProfileRepo } from "@/modules/rpg/profile/repository";
import { getItemDefinition, getToolMaxDurability } from "@/modules/inventory/items";
import { EQUIPMENT_SLOTS } from "@/modules/rpg/config";
import { getContextInfo, replyEphemeral } from "@/adapters/seyfert";
import { StatsCalculator } from "@/modules/rpg/stats/calculator";
import { renderProgressBar } from "@/modules/economy/account/formatting";
import { UIColors } from "@/modules/ui/design-system";

const options = {
    user: createUserOption({
        description: "User to view loadout of (default: yourself)",
        required: false,
    }),
};

@Declare({
    name: "loadout",
    description: "🎒 View your RPG equipment loadout",
})
@BindDisabled(Features.Economy)
@Cooldown({
    type: CooldownType.User,
    interval: 5000,
    uses: { default: 1 },
})
@Options(options)
export default class RpgLoadoutSubcommand extends SubCommand {
    async run(ctx: GuildCommandContext<typeof options>) {
        await ctx.deferReply(true);
        const { userId, username } = getContextInfo(ctx);
        const viewUserId = ctx.options.user?.id ?? userId;

        const profileResult = await rpgProfileRepo.findById(viewUserId);

        if (profileResult.isErr() || !profileResult.unwrap()) {
            if (viewUserId === userId) {
                await replyEphemeral(ctx, {
                    content:
                        "❌ You need an RPG profile first! Use `/rpg profile` to create one.",
                });
            } else {
                await replyEphemeral(ctx, {
                    content: "❌ That user doesn't have an RPG profile.",
                });
            }
            return;
        }

        const profile = profileResult.unwrap()!;
        const viewName =
            viewUserId === userId ? username : ctx.options.user?.username ?? "Unknown";

        // Calculate total stats
        const resolveStats = (id: string) => getItemDefinition(id)?.stats || null;
        const stats = StatsCalculator.calcStats(profile.loadout, resolveStats);

        // Build embed
        const embed = new Embed()
            .setTitle(`👤 ${viewName}'s Loadout`)
            .setColor(UIColors.info);

        // Equipment section
        const SLOT_EMOJIS: Record<string, string> = {
            weapon: "⚔️",
            shield: "🛡️",
            helmet: "⛑️",
            chest: "👕",
            pants: "👖",
            boots: "👢",
            ring: "💍",
            necklace: "📿",
            tool: "⛏️",
        };

        let equipmentText = "";


        for (const slot of EQUIPMENT_SLOTS) {
            const equipped = profile.loadout[slot];
            if (equipped) {

                let itemId: string;
                let durabilityBar = "";

                if (typeof equipped === "string") {
                    itemId = equipped;
                } else {
                    itemId = equipped.itemId;
                    const def = getItemDefinition(itemId);
                    const max = (def && getToolMaxDurability(def)) || 100;
                    const percent = (equipped.durability / max) * 100;
                    durabilityBar = ` ${renderProgressBar(percent, 5)} \`${equipped.durability}\``;
                }

                const def = getItemDefinition(itemId);
                const emoji = SLOT_EMOJIS[slot] || "📦";
                const name = def?.name ?? itemId;

                // Get key stats for this item
                const itemStats: string[] = [];
                if (def?.stats) {
                    if (def.stats.atk) itemStats.push(`+${def.stats.atk} ATK`);
                    if (def.stats.def) itemStats.push(`+${def.stats.def} DEF`);
                    if (def.stats.hp) itemStats.push(`+${def.stats.hp} HP`);
                }

                const statsText =
                    itemStats.length > 0 ? ` (${itemStats.join(", ")})` : "";

                equipmentText += `${emoji} **${slot.charAt(0).toUpperCase() + slot.slice(1)}:** ${name}${durabilityBar}${statsText}\n`;
            } else {
                equipmentText += `${SLOT_EMOJIS[slot] || "📦"} **${slot.charAt(0).toUpperCase() + slot.slice(1)}:** *Empty*\n`;
            }
        }

        embed.setDescription(equipmentText);

        // Stats section
        const hpPercent = (profile.hpCurrent / stats.maxHp) * 100;
        const hpBar = renderProgressBar(hpPercent, 8);

        const statsField =
            `❤️ **HP:** ${hpBar} ${profile.hpCurrent}/${stats.maxHp}\n` +
            `⚔️ **ATK:** ${stats.atk}\n` +
            `🛡️ **DEF:** ${stats.def}`;

        embed.addFields({ name: "📊 Total Stats", value: statsField, inline: false });

        // Combat record
        const totalFights = profile.wins + profile.losses;
        const winRate =
            totalFights > 0 ? Math.round((profile.wins / totalFights) * 100) : 0;

        embed.addFields({
            name: "Combat Record",
            value: `🏆 ${profile.wins}W / ${profile.losses}L (${winRate}%)`,
            inline: true,
        });

        if (profile.isFighting) {
            embed.setFooter({ text: "⚔️ Currently in combat" });
        }

        await ctx.editOrReply({ embeds: [embed] });
    }
}
