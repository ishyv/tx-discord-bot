/**
 * Round Card View Builder.
 * 
 * Purpose: Visual summary of a combat round.
 * Context: Discord embeds (mobile-friendly).
 */

import { Embed } from "seyfert";
import type { FightRound, CombatMove } from "../../combat/fight-schema";
import { HpBarRenderer } from "../hp-bar";
import { CombatLogFormatter } from "../combat-log";
import { UIColors } from "@/modules/ui/design-system";

/** Render a compact HP bar for the round card. */
export function renderCombatHpBar(current: number, max: number, label: string): string {
    const bar = HpBarRenderer.render({
        current,
        max,
        length: 8,
        showPercent: true,
    });
    return `**${label}**\n${bar}`;
}

/** Render a single line summary of a move outcome. */
function renderMoveOutcome(
    attackerName: string,
    move: CombatMove,
    damage: number,
    isDefaulted: boolean
): string {
    const moveName = CombatLogFormatter.formatMove(move);
    const icon = move === "crit" ? "💥" : (move === "block" ? "🛡️" : "⚔️");
    const defaultedText = isDefaulted ? " (⏳ Timeout)" : "";

    if (damage > 0) {
        return `${icon} **${attackerName}** used **${moveName}** for **${damage}** damage${defaultedText}`;
    }

    if (move === "block") {
        return `🛡️ **${attackerName}** blocked successfully!`;
    }

    return `${icon} **${attackerName}** used **${moveName}**${defaultedText}`;
}

/** Build a round summary embed. */
export function buildRoundCard(
    round: FightRound,
    p1Name: string,
    p2Name: string,
    p1MaxHp: number,
    p2MaxHp: number,
    roundNumber: number
): Embed {
    const embed = new Embed()
        .setColor(UIColors.amethyst)
        .setTitle(`⚔️ Fight: Round ${roundNumber}`)
        .setDescription([
            renderMoveOutcome(p1Name, round.p1Move, round.p2Damage, round.p1TimeoutDefaulted),
            renderMoveOutcome(p2Name, round.p2Move, round.p1Damage, round.p2TimeoutDefaulted),
        ].join("\n"));

    embed.addFields(
        {
            name: p1Name,
            value: HpBarRenderer.render({ current: round.p1Hp, max: p1MaxHp, length: 10 }),
            inline: true
        },
        {
            name: p2Name,
            value: HpBarRenderer.render({ current: round.p2Hp, max: p2MaxHp, length: 10 }),
            inline: true
        }
    );

    return embed;
}
