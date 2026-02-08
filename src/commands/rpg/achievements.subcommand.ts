/**
 * Achievements Subcommand (Part of /rpg).
 *
 * Purpose: Display achievement board and manage achievements.
 * Context: Shows player progression achievements.
 * Note: This replaces the standalone /achievements command.
 */

import {
    Declare,
    SubCommand,
    type CommandContext,
    Options,
    createStringOption,
    Embed,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
    achievementService,
    buildAchievementBoardEmbed,
    buildAchievementDetailEmbed,
    buildCategoryAchievementsEmbed,
    buildAchievementErrorEmbed,
    CATEGORY_DISPLAY,
} from "@/modules/economy/achievements";

const achievementOptions = {
    action: createStringOption({
        description: "Achievement action",
        required: false,
        choices: [
            { name: "📋 View board", value: "board" },
            { name: "📜 List all", value: "list" },
        ],
    }),
    category: createStringOption({
        description: "Filter by category",
        required: false,
        choices: [
            { name: "📈 Progression", value: "progression" },
            { name: "🎮 Minigames", value: "minigame" },
            { name: "⚒️ Crafting", value: "crafting" },
            { name: "👥 Social", value: "social" },
            { name: "🎒 Collection", value: "collection" },
            { name: "✨ Special", value: "special" },
        ],
    }),
    id: createStringOption({
        description: "Achievement ID to view details",
        required: false,
    }),
};

@Declare({
    name: "achievements",
    description: "🏆 View your achievements and rewards",
})
@BindDisabled(Features.Economy)
@Cooldown({
    type: CooldownType.User,
    interval: 5000,
    uses: { default: 5 },
})
@Options(achievementOptions)
export default class RpgAchievementsSubcommand extends SubCommand {
    async run(ctx: CommandContext<typeof achievementOptions>) {
        const guildId = ctx.guildId;
        const userId = ctx.author.id;

        if (!guildId) {
            await ctx.write({
                embeds: [
                    buildAchievementErrorEmbed(
                        "This command can only be used in a server.",
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const action = ctx.options.action ?? "board";
        const category = ctx.options.category;
        const achievementId = ctx.options.id;

        // If viewing specific achievement
        if (achievementId) {
            await this.viewAchievement(ctx, guildId, userId, achievementId);
            return;
        }

        // If filtering by category
        if (category) {
            await this.viewCategory(ctx, guildId, userId, category);
            return;
        }

        // Handle action
        switch (action) {
            case "list":
                await this.listAchievements(ctx, guildId, userId);
                break;
            case "board":
            default:
                await this.viewBoard(ctx, guildId, userId);
                break;
        }
    }

    private async viewBoard(
        ctx: CommandContext,
        guildId: string,
        userId: string,
    ) {
        const boardResult = await achievementService.getAchievementBoard(
            userId,
            guildId,
        );
        if (boardResult.isErr()) {
            await ctx.write({
                embeds: [
                    buildAchievementErrorEmbed(`Error: ${boardResult.error.message}`),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const embed = buildAchievementBoardEmbed(
            boardResult.unwrap(),
            ctx.author.username,
        );
        await ctx.write({ embeds: [embed] });
    }

    private async viewAchievement(
        ctx: CommandContext,
        guildId: string,
        userId: string,
        achievementId: string,
    ) {
        const achievementResult = await achievementService.getAchievementView(
            userId,
            guildId,
            achievementId,
        );

        if (achievementResult.isErr()) {
            await ctx.write({
                embeds: [
                    buildAchievementErrorEmbed(
                        `Error: ${achievementResult.error.message}`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const achievement = achievementResult.unwrap();
        if (!achievement) {
            await ctx.write({
                embeds: [buildAchievementErrorEmbed("Achievement not found.")],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const embed = buildAchievementDetailEmbed(achievement);
        await ctx.write({ embeds: [embed] });
    }

    private async viewCategory(
        ctx: CommandContext,
        guildId: string,
        userId: string,
        category: string,
    ) {
        const boardResult = await achievementService.getAchievementBoard(
            userId,
            guildId,
        );
        if (boardResult.isErr()) {
            await ctx.write({
                embeds: [
                    buildAchievementErrorEmbed(`Error: ${boardResult.error.message}`),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const categoryAchievements = boardResult
            .unwrap()
            .achievements.filter((a) => a.category === category);

        if (categoryAchievements.length === 0) {
            await ctx.write({
                embeds: [
                    buildAchievementErrorEmbed("No achievements in this category."),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const embed = buildCategoryAchievementsEmbed(
            category,
            categoryAchievements,
        );
        await ctx.write({ embeds: [embed] });
    }

    private async listAchievements(
        ctx: CommandContext,
        guildId: string,
        userId: string,
    ) {
        const boardResult = await achievementService.getAchievementBoard(
            userId,
            guildId,
        );
        if (boardResult.isErr()) {
            await ctx.write({
                embeds: [
                    buildAchievementErrorEmbed(`Error: ${boardResult.error.message}`),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const achievements = boardResult.unwrap().achievements;

        // Group by category
        const byCategory = new Map<string, typeof achievements>();
        for (const achievement of achievements) {
            const list = byCategory.get(achievement.category) ?? [];
            list.push(achievement);
            byCategory.set(achievement.category, list);
        }

        const embed = new Embed()
            .setTitle("📜 Achievement List")
            .setDescription(`There are ${achievements.length} achievements available.`)
            .setColor(0xf39c12);

        for (const [cat, list] of byCategory) {
            const catInfo = CATEGORY_DISPLAY[cat as keyof typeof CATEGORY_DISPLAY];
            const lines = list.map((a) => {
                const status = a.isUnlocked ? "✅" : "🔒";
                return `${status} ${a.tierEmoji} ${a.name}`;
            });

            embed.addFields({
                name: `${catInfo.emoji} ${catInfo.name}`,
                value: lines.join("\n").slice(0, 1024),
                inline: false,
            });
        }

        await ctx.write({ embeds: [embed] });
    }
}
