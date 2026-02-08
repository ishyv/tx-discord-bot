/**
 * Fight Subcommand (Part of /rpg).
 *
 * Purpose: Challenge players to combat, accept fights, and submit moves.
 * Context: RPG combat system with moves (attack, block, crit).
 * Note: This replaces the standalone /fight command.
 */
import {
    Declare,
    SubCommand,
    GuildCommandContext,
    Options,
    createStringOption,
    createUserOption,
    Embed,
    ActionRow,
} from "seyfert";
import { ButtonStyle, MessageFlags } from "seyfert/lib/types";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { Button } from "@/modules/ui";
import { rpgFightService } from "@/modules/rpg/combat/fight-service";
import { rpgProfileRepo } from "@/modules/rpg/profile/repository";
import { RpgViews } from "@/modules/rpg/views/embeds";
import { HpBarRenderer } from "@/modules/rpg/views/hp-bar";
import { buildRoundCard } from "@/modules/rpg/views/combat/round-card";
import { COMBAT_CONFIG } from "@/modules/rpg/config";
import { getItemDefinition } from "@/modules/inventory/items";
import { CombatLogFormatter } from "@/modules/rpg/views/combat-log";
import type { CombatMove } from "@/modules/rpg/types";

const options = {
    action: createStringOption({
        description: "Combat action",
        required: true,
        choices: [
            { name: "Challenge a player", value: "challenge" },
            { name: "View pending challenges", value: "accept" },
            { name: "View fight status", value: "status" },
            { name: "Forfeit current fight", value: "forfeit" },
        ],
    }),
    user: createUserOption({
        description: "User to challenge (for challenge action)",
        required: false,
    }),
};

@Declare({
    name: "fight",
    description: "⚔️ Battle other players",
})
@BindDisabled(Features.Economy)
@Cooldown({
    type: CooldownType.User,
    interval: 5000,
    uses: { default: 1 },
})
@Options(options)
export default class RpgFightSubcommand extends SubCommand {
    async run(ctx: GuildCommandContext<typeof options>) {
        const { action, user: targetUser } = ctx.options;
        const userId = ctx.author.id;
        const guildId = ctx.guildId ?? undefined;

        switch (action) {
            case "challenge":
                await ctx.deferReply(false);
                if (!targetUser) {
                    await ctx.editOrReply({
                        content: "❌ Please specify a user to challenge with the `user` option.",
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                await this.challenge(ctx, userId, targetUser.id, guildId);
                break;

            case "accept":
                await ctx.deferReply(true);
                await this.showPendingChallenges(ctx, userId);
                break;

            case "status":
                await ctx.deferReply(true);
                await this.showStatus(ctx, userId);
                break;

            case "forfeit":
                await ctx.deferReply(true);
                await this.forfeit(ctx, userId);
                break;
        }
    }

    private async challenge(
        ctx: GuildCommandContext<typeof options>,
        inviterId: string,
        targetId: string,
        guildId: string | undefined,
    ) {
        // Check profiles exist
        const [inviterProfile, targetProfile] = await Promise.all([
            rpgProfileRepo.findById(inviterId),
            rpgProfileRepo.findById(targetId),
        ]);

        if (inviterProfile.isErr() || !inviterProfile.unwrap()) {
            await ctx.editOrReply({
                content: "❌ You need an RPG profile first! Use `/rpg profile` to create one.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (targetProfile.isErr() || !targetProfile.unwrap()) {
            await ctx.editOrReply({
                content: "❌ That user doesn't have an RPG profile.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Check inviter not in combat
        if (inviterProfile.unwrap()!.isFighting) {
            await ctx.editOrReply({
                content: "❌ You are already in a fight!",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Create challenge
        const result = await rpgFightService.challenge(
            { inviterId, targetId, guildId },
            (itemId) => {
                const def = getItemDefinition(itemId);
                return def?.stats
                    ? { atk: def.stats.atk, def: def.stats.def, hp: def.stats.hp }
                    : null;
            },
        );

        if (result.isErr()) {
            const error = result.error;
            const messages: Record<string, string> = {
                SELF_COMBAT: "❌ You can't fight yourself!",
                IN_COMBAT: "❌ One of you is already in a fight!",
                UPDATE_FAILED: "❌ Failed to create challenge.",
            };

            await ctx.editOrReply({
                content: messages[(error as { code?: string }).code ?? ""] ?? `❌ ${error.message}`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const { fightId, expiresAt } = result.unwrap();

        // Create embed
        const embedData = RpgViews.combatInvite(
            ctx.author.username,
            ctx.options.user?.username ?? "Unknown",
            expiresAt,
        );

        const embed = new Embed()
            .setTitle(embedData.title)
            .setDescription(embedData.description)
            .setColor(embedData.color);

        // Buttons for target
        const acceptBtn = new Button()
            .setLabel("✅ Accept")
            .setStyle(ButtonStyle.Success)
            .onClick("rpg_fight_accept", async (buttonCtx) => {
                if (buttonCtx.author.id !== targetId) {
                    await buttonCtx.write({
                        content: "❌ You cannot interact with this fight.",
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                await this.handleAccept(buttonCtx, fightId, targetId);
            });

        const declineBtn = new Button()
            .setLabel("❌ Decline")
            .setStyle(ButtonStyle.Danger)
            .onClick("rpg_fight_decline", async (buttonCtx) => {
                if (buttonCtx.author.id !== targetId) {
                    await buttonCtx.write({
                        content: "❌ You cannot interact with this fight.",
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                await buttonCtx.deferUpdate();
                await buttonCtx.editOrReply({
                    content: "❌ Challenge declined.",
                    embeds: [],
                    components: [],
                });
            });

        const row = new ActionRow<typeof acceptBtn>().addComponents(acceptBtn, declineBtn);

        await ctx.editOrReply({
            content: `<@${targetId}>, you've been challenged to a duel!`,
            embeds: [embed],
            components: [row],
        });
    }

    private async showPendingChallenges(ctx: GuildCommandContext, userId: string) {
        // Find pending fight where user is p2
        const activeFight = await rpgFightService.isInFight(userId);

        if (!activeFight) {
            await ctx.editOrReply({ content: "❌ You don't have any pending challenges.", flags: MessageFlags.Ephemeral });
            return;
        }

        // Get fight details
        const profileResult = await rpgProfileRepo.findById(userId);
        if (profileResult.isOk() && profileResult.unwrap()) {
            const activeFightId = profileResult.unwrap()!.activeFightId;
            if (activeFightId) {
                const fightResult = await rpgFightService.getFight(activeFightId);
                if (fightResult.isOk() && fightResult.unwrap()) {
                    const fight = fightResult.unwrap()!;
                    if (fight.status === "pending" && fight.p2Id === userId) {
                        // Show accept button
                        const embed = new Embed()
                            .setTitle("⚔️ Pending Challenge")
                            .setDescription("You have a pending duel challenge! Click below to accept.")
                            .setColor(0xffa500);

                        const acceptBtn = new Button()
                            .setLabel("✅ Accept Challenge")
                            .setStyle(ButtonStyle.Success)
                            .onClick("rpg_fight_accept_pending", async (buttonCtx) => {
                                if (buttonCtx.author.id !== userId) {
                                    await buttonCtx.write({
                                        content: "❌ You cannot interact with this fight.",
                                        flags: MessageFlags.Ephemeral,
                                    });
                                    return;
                                }
                                await this.handleAccept(buttonCtx, fight.fightId, userId);
                            });

                        const row = new ActionRow<typeof acceptBtn>().addComponents(acceptBtn);

                        await ctx.editOrReply({ embeds: [embed], components: [row], flags: 64 });
                        return;
                    }
                }
            }
        }

        await ctx.editOrReply({ content: "❌ You don't have any pending challenges.", flags: MessageFlags.Ephemeral });
    }

    private async showStatus(ctx: GuildCommandContext, userId: string) {
        const profileResult = await rpgProfileRepo.findById(userId);
        if (profileResult.isErr() || !profileResult.unwrap()) {
            await ctx.editOrReply({
                content: "❌ You need an RPG profile first!",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const profile = profileResult.unwrap()!;

        if (!profile.isFighting || !profile.activeFightId) {
            await ctx.editOrReply({ content: "ℹ️ You are not currently in a fight.", flags: MessageFlags.Ephemeral });
            return;
        }

        const fightResult = await rpgFightService.getFight(profile.activeFightId);
        if (fightResult.isErr() || !fightResult.unwrap()) {
            await ctx.editOrReply({ content: "❌ Could not load fight status.", flags: MessageFlags.Ephemeral });
            return;
        }

        const fight = fightResult.unwrap()!;

        // Get opponent info
        const opponentId = fight.p1Id === userId ? fight.p2Id : fight.p1Id;
        const opponent = await ctx.client.users.fetch(opponentId);

        // Create status embed
        const embed = new Embed()
            .setTitle(`⚔️ Fight Status - Round ${fight.currentRound}`)
            .setColor(0x800080);

        // HP bars
        const p1User = await ctx.client.users.fetch(fight.p1Id);
        const p2User = await ctx.client.users.fetch(fight.p2Id);
        const p1Name = p1User?.username ?? "Player 1";
        const p2Name = p2User?.username ?? "Player 2";

        const userHpBar = HpBarRenderer.render({
            current: fight.p1Id === userId ? fight.p1Hp : fight.p2Hp,
            max: fight.p1Id === userId ? fight.p1MaxHp : fight.p2MaxHp,
            length: 10,
        });

        const opponentHpBar = HpBarRenderer.render({
            current: fight.p1Id === userId ? fight.p2Hp : fight.p1Hp,
            max: fight.p1Id === userId ? fight.p2MaxHp : fight.p1MaxHp,
            length: 10,
        });

        embed.addFields(
            { name: "You", value: userHpBar, inline: true },
            { name: opponent?.username ?? "Opponent", value: opponentHpBar, inline: true },
        );

        // Timeout info
        const lastAction = new Date(fight.lastActionAt).getTime();
        const timeoutSeconds = COMBAT_CONFIG.roundTimeoutSeconds;
        const expiresAt = lastAction + timeoutSeconds * 1000;
        const timeLeft = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));

        embed.addFields({
            name: "⏱️ Round Timeout",
            value: timeLeft > 0 ? `Action needed within **${timeLeft}s**` : "⚠️ Round is overdue!",
            inline: false
        });

        // Show round card if there was a previous round
        if (fight.lastRound) {
            const roundEmbed = buildRoundCard(
                fight.lastRound,
                p1Name,
                p2Name,
                fight.p1MaxHp,
                fight.p2MaxHp,
                fight.lastRound.roundNumber
            );
            embed.setDescription(`**Last Round Summary:**\n${roundEmbed.data.description}\n\n*Fight continues...*`);
        }

        // Show move buttons if active
        if (fight.status === "active") {
            const userPending = fight.p1Id === userId ? !fight.p1PendingMove : !fight.p2PendingMove;

            if (userPending) {
                embed.setFooter({ text: "⏳ Waiting for your move..." });

                const attackBtn = new Button()
                    .setLabel("⚔️ Attack")
                    .setStyle(ButtonStyle.Primary)
                    .onClick("rpg_fight_move_attack", async (buttonCtx) => {
                        if (buttonCtx.author.id !== userId) {
                            await buttonCtx.write({
                                content: "❌ You cannot interact with this fight.",
                                flags: MessageFlags.Ephemeral,
                            });
                            return;
                        }
                        await this.handleMove(buttonCtx, fight.fightId, userId, "attack");
                    });

                const blockBtn = new Button()
                    .setLabel("🛡️ Block")
                    .setStyle(ButtonStyle.Secondary)
                    .onClick("rpg_fight_move_block", async (buttonCtx) => {
                        if (buttonCtx.author.id !== userId) {
                            await buttonCtx.write({
                                content: "❌ You cannot interact with this fight.",
                                flags: MessageFlags.Ephemeral,
                            });
                            return;
                        }
                        await this.handleMove(buttonCtx, fight.fightId, userId, "block");
                    });

                const critBtn = new Button()
                    .setLabel("💥 Critical")
                    .setStyle(ButtonStyle.Danger)
                    .onClick("rpg_fight_move_crit", async (buttonCtx) => {
                        if (buttonCtx.author.id !== userId) {
                            await buttonCtx.write({
                                content: "❌ You cannot interact with this fight.",
                                flags: MessageFlags.Ephemeral,
                            });
                            return;
                        }
                        await this.handleMove(buttonCtx, fight.fightId, userId, "crit");
                    });

                const row = new ActionRow<typeof attackBtn>().addComponents(attackBtn, blockBtn, critBtn);

                await ctx.editOrReply({ embeds: [embed], components: [row], flags: 64 });
                return;
            } else {
                const opponentPending = fight.p1Id === userId ? !fight.p2PendingMove : !fight.p1PendingMove;
                embed.setFooter({
                    text: opponentPending ? "✅ Move submitted! Waiting for opponent..." : "🔄 Both moves in! Processing..."
                });
            }
        }

        await ctx.editOrReply({ embeds: [embed], flags: 64 });
    }

    private async forfeit(ctx: GuildCommandContext, userId: string) {
        const profileResult = await rpgProfileRepo.findById(userId);
        if (profileResult.isErr() || !profileResult.unwrap()?.isFighting) {
            await ctx.editOrReply({ content: "❌ You are not in a fight.", flags: MessageFlags.Ephemeral });
            return;
        }

        const fightId = profileResult.unwrap()!.activeFightId;
        if (!fightId) {
            await ctx.editOrReply({ content: "❌ Could not find your active fight.", flags: MessageFlags.Ephemeral });
            return;
        }

        const result = await rpgFightService.forfeit(fightId, userId);

        if (result.isErr()) {
            await ctx.editOrReply({ content: `❌ ${result.error.message}`, flags: MessageFlags.Ephemeral });
            return;
        }

        await ctx.editOrReply({ content: "🏳️ You have forfeited the fight." });
    }

    private async handleAccept(ctx: any, fightId: string, userId: string) {
        await ctx.deferUpdate();

        const result = await rpgFightService.accept(
            { fightId, accepterId: userId },
            (itemId) => {
                const def = getItemDefinition(itemId);
                if (def && "stats" in def && def.stats) {
                    return { atk: def.stats.atk, def: def.stats.def, hp: def.stats.hp };
                }
                return null;
            },
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

    private async handleMove(
        ctx: any,
        fightId: string,
        userId: string,
        move: CombatMove,
    ) {
        await ctx.deferUpdate();
        const result = await rpgFightService.submitMove({
            fightId,
            playerId: userId,
            move,
        });

        if (result.isErr()) {
            await ctx.followup({
                content: `❌ ${result.error.message}`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const fight = result.unwrap();

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
                fight.rounds,
            );

            await ctx.editOrReply({
                content: `🏆 **Combat Ended!**\n${summary}`,
                embeds: [],
                components: [],
            });
        } else if (fight.lastRound && fight.lastRound.roundNumber === fight.rounds) {
            const p1User = await ctx.client.users.fetch(fight.p1Id);
            const p2User = await ctx.client.users.fetch(fight.p2Id);

            const roundEmbed = buildRoundCard(
                fight.lastRound,
                p1User?.username ?? "P1",
                p2User?.username ?? "P2",
                fight.p1MaxHp,
                fight.p2MaxHp,
                fight.lastRound.roundNumber,
            );

            await ctx.editOrReply({
                content: `⚔️ **Round ${fight.lastRound.roundNumber} Resolved!**`,
                embeds: [roundEmbed],
                components: [],
            });
        } else {
            await ctx.editOrReply({
                content: "✅ Move submitted! Waiting for opponent...",
                components: [],
            });
        }
    }
}
