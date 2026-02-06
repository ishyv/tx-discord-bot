/**
 * RPG UI Utilities (Phase 12 Shared Primitives).
 *
 * Purpose: Centralized UI formatters and embed builders for all RPG features.
 * Context: Shared across inventory, combat, progression, quests, events.
 * Dependencies: design-system.ts for base patterns.
 */

import { Embed } from "seyfert";
import { UIColors, Emoji, renderProgressBar } from "@/modules/ui/design-system";
import type { CombatStats } from "../types";
import type { APIEmbedField } from "seyfert/lib/types";

/**
 * Format an instance ID tag for display.
 * Returns: "#ab12cd" (last 6 chars)
 */
export function formatInstanceTag(instanceId: string): string {
    const suffix = instanceId.slice(-6);
    return `#${suffix}`;
}

/**
 * Render a generic bar (HP, durability, XP, etc).
 * @param value Current value
 * @param max Maximum value
 * @param width Bar width in characters (default 10)
 * @param filledChar Character for filled portion
 * @param emptyChar Character for empty portion
 */
export function renderBar(
    value: number,
    max: number,
    width = 10,
    filledChar = Emoji.bar_filled,
    emptyChar = Emoji.bar_empty,
): string {
    const percent = Math.max(0, Math.min(100, (value / max) * 100));
    return renderProgressBar(percent, width, filledChar, emptyChar);
}

/**
 * Render HP bar with value display.
 * Returns: "████░░░░░░ 42/100"
 */
export function renderHpBar(hp: number, maxHp: number): string {
    const bar = renderBar(hp, maxHp);
    return `${bar} ${hp}/${maxHp}`;
}

/**
 * Render durability bar with value display.
 * Returns: "███████░░░ 70/100"
 */
export function renderDurabilityBar(current: number, max: number): string {
    const bar = renderBar(current, max);
    return `${bar} ${current}/${max}`;
}

/**
 * Render combat stats in compact format.
 * Returns: "ATK 12 | DEF 8 | HP 100"
 */
export function renderStatLine(stats: CombatStats): string {
    return `ATK ${stats.atk} | DEF ${stats.def} | HP ${stats.maxHp}`;
}

/**
 * Render stat delta (before → after).
 * Returns: "+2 ATK, -1 DEF, +10 HP" or "No change"
 */
export function renderStatDelta(before: CombatStats, after: CombatStats): string {
    const parts: string[] = [];

    const atkDelta = after.atk - before.atk;
    const defDelta = after.def - before.def;
    const hpDelta = after.maxHp - before.maxHp;

    if (atkDelta !== 0) {
        const sign = atkDelta > 0 ? "+" : "";
        parts.push(`${sign}${atkDelta} ATK`);
    }

    if (defDelta !== 0) {
        const sign = defDelta > 0 ? "+" : "";
        parts.push(`${sign}${defDelta} DEF`);
    }

    if (hpDelta !== 0) {
        const sign = hpDelta > 0 ? "+" : "";
        parts.push(`${sign}${hpDelta} HP`);
    }

    return parts.length > 0 ? parts.join(", ") : "No change";
}

/**
 * Build a compact embed (consistent style).
 * @param title Embed title
 * @param lines Array of description lines
 * @param footer Optional footer text
 * @param color Optional color (defaults to UIColors.info)
 */
export function buildCompactEmbed(
    title: string,
    lines: string[],
    footer?: string,
    color: number = UIColors.info,
): Embed {
    const embed = new Embed().setColor(color).setTitle(title);

    if (lines.length > 0) {
        embed.setDescription(lines.join("\n"));
    }

    if (footer) {
        embed.setFooter({ text: footer });
    }

    return embed;
}

/**
 * Build a consistent error embed.
 * @param errorCode Technical error code (for logging/debugging)
 * @param humanMessage User-friendly error message
 * @param solution Optional solution hint
 */
export function buildErrorEmbed(
    errorCode: string,
    humanMessage: string,
    solution?: string,
): Embed {
    const lines: string[] = [humanMessage];

    if (solution) {
        lines.push("");
        lines.push(`💡 ${solution}`);
    }

    const embed = new Embed()
        .setColor(UIColors.error)
        .setTitle(`${Emoji.error} Error`)
        .setDescription(lines.join("\n"));

    embed.setFooter({ text: `Error: ${errorCode}` });

    return embed;
}

/**
 * Build a preview + confirmation embed.
 * Returns embed and component IDs for confirm/cancel.
 */
export function buildConfirmFlow(params: {
    title: string;
    description: string;
    fields?: APIEmbedField[];
    confirmId: string;
    cancelId: string;
}): { embed: Embed; confirmId: string; cancelId: string } {
    const embed = new Embed()
        .setColor(UIColors.warning)
        .setTitle(`${Emoji.warning} ${params.title}`)
        .setDescription(params.description);

    if (params.fields && params.fields.length > 0) {
        embed.setFields(params.fields);
    }

    embed.setFooter({ text: "Click Confirm to proceed or Cancel to abort." });

    return {
        embed,
        confirmId: params.confirmId,
        cancelId: params.cancelId,
    };
}

/**
 * Build a paged select menu data structure.
 * @param items All items to paginate
 * @param page Current page (0-indexed)
 * @param pageSize Items per page
 * @param labelFn Function to generate label from item
 * @param valueFn Function to generate value from item
 */
export function buildPagedSelect<T>(
    items: T[],
    page: number,
    pageSize: number,
    labelFn: (item: T, index: number) => string,
    valueFn: (item: T, index: number) => string,
): {
    options: Array<{ label: string; value: string }>;
    page: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
} {
    const totalPages = Math.ceil(items.length / pageSize);
    const start = page * pageSize;
    const end = start + pageSize;
    const pageItems = items.slice(start, end);

    const options = pageItems.map((item, idx) => ({
        label: labelFn(item, start + idx),
        value: valueFn(item, start + idx),
    }));

    return {
        options,
        page,
        totalPages,
        hasNext: page < totalPages - 1,
        hasPrev: page > 0,
    };
}
