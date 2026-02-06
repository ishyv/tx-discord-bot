/**
 * RPG Fight Interaction Handler.
 *
 * Purpose: Handle all combat-related button interactions (accept, decline, moves).
 * Context: Processes fight_accept, fight_decline, and fight_move button clicks.
 */

import { ComponentCommand, type ComponentContext, Embed } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { rpgFightService } from "@/modules/rpg/combat/fight-service";
import { CombatLogFormatter } from "@/modules/rpg/views/combat-log";
import { buildRoundCard } from "@/modules/rpg/views/combat/round-card";
import { getItemDefinition } from "@/modules/inventory/items";
import type { CombatMove } from "@/modules/rpg/types";

export default class FightInteractionHandler extends ComponentCommand {
    componentType = "Button" as const;

    filter(ctx: ComponentContext<"Button">) {
        return ctx.customId.startsWith("fight_");
    }

    async run(ctx: ComponentContext<"Button">) {
        const customId = ctx.customId;
        const parts = customId.split("_");
        // Format: fight_[action]_[fightId]_[userId]_[additional]
        const action = parts[1];
        const fightId = parts[2];
        const expectedUserId = parts[3];
        const actualUserId = ctx.author.id;

        // Security: Verify user
        if (actualUserId !== expectedUserId) {
            await ctx.write({
                content: "❌ You cannot interact with this fight.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        switch (action) {
            case "accept":
                await this.handleAccept(ctx, fightId, actualUserId);
                break;
            case "decline":
                await this.handleDecline(ctx);
                break;
            case "move":
                const move = parts[parts.length - 1] as CombatMove;
                await this.handleMove(ctx, fightId, actualUserId, move);
                break;
        }
    }

    private async handleAccept(ctx: ComponentContext<"Button">, fightId: string, userId: string) {
        await ctx.deferUpdate();

        const result = await rpgFightService.accept(
            { fightId, accepterId: userId },
            (itemId) => {
                const def = getItemDefinition(itemId);
                if (def && "stats" in def && def.stats) {
                    return { atk: def.stats.atk, def: def.stats.def, hp: def.stats.hp };
                }
                return null;
            }
        );

        if (result.isErr()) {
            await ctx.editOrReply({
                content: `❌ ${result.error.message}`,
                components: [],
            });
            return;
        }

        await ctx.editOrReply({
            content: "⚔️ **Challenge Accepted!** The fight has begun.",
            embeds: [
                new Embed()
                    .setTitle("⚔️ Round 1")
                    .setDescription("Both fighters prepare their moves...")
                    .setColor(0x800080),
            ],
            components: [],
        });
    }

    private async handleDecline(ctx: ComponentContext<"Button">) {
        // Just delete or update the message
        await ctx.deferUpdate();
        await ctx.editOrReply({
            content: "❌ Challenge declined.",
            embeds: [],
            components: [],
        });
    }

    private async handleMove(ctx: ComponentContext<"Button">, fightId: string, userId: string, move: CombatMove) {
        await ctx.deferUpdate();
        const result = await rpgFightService.submitMove({
            fightId,
            playerId: userId,
            move,
        });

        if (result.isErr()) {
            await ctx.followup({
                content: `❌ ${result.error.message}`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const fight = result.unwrap();

        // If round resolved, we want to broadcast the round card or update the message
        if (fight.status === "completed") {
            const p1User = await ctx.client.users.fetch(fight.p1Id);
            const p2User = await ctx.client.users.fetch(fight.p2Id);

            const summary = CombatLogFormatter.formatCombatSummary(
                p1User?.username ?? "P1",
                p2User?.username ?? "P2",
                fight.winnerId!,
                fight.p1Id,
                fight.p1Hp,
                fight.p2Hp,
                fight.rounds
            );

            await ctx.editOrReply({
                content: `🏆 **Combat Ended!**\n${summary}`,
                embeds: [],
                components: [],
            });
        } else if (fight.lastRound && fight.lastRound.roundNumber === fight.rounds) {
            // Round resolved!
            const p1User = await ctx.client.users.fetch(fight.p1Id);
            const p2User = await ctx.client.users.fetch(fight.p2Id);

            const roundEmbed = buildRoundCard(
                fight.lastRound,
                p1User?.username ?? "P1",
                p2User?.username ?? "P2",
                fight.p1MaxHp,
                fight.p2MaxHp,
                fight.lastRound.roundNumber
            );

            await ctx.editOrReply({
                content: `⚔️ **Round ${fight.lastRound.roundNumber} Resolved!**`,
                embeds: [roundEmbed],
                components: [],
            });
        } else {
            await ctx.editOrReply({
                content: `✅ Move submitted! Waiting for opponent...`,
                components: [],
            });
        }
    }
}
