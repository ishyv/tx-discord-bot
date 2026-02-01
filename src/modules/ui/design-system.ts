/**
 * UI Design System Implementation
 *
 * Purpose: Centralized constants, utilities, and embed builders for the
 * VOID ARCHIVE design system. Import these throughout the bot for consistent UI.
 *
 * @see docs/ui-style-guide.md for design rationale
 * @see docs/ui-interface-redesigns.md for screen specifications
 */

import { Embed, ActionRow, Button } from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";
import type { APIEmbedField } from "seyfert/lib/types";

// ============================================================================
// COLOR PALETTE
// ============================================================================

/**
 * VOID ARCHIVE color palette.
 * Use semantic names, not color names.
 */
export const UIColors = {
    // Primary states
    void: 0x1a1a2e,       // Default/brand
    success: 0x10b981,    // Green - positive outcomes
    warning: 0xf59e0b,    // Amber - cautions, pending
    error: 0xef4444,      // Red - failures, restrictions
    info: 0x6366f1,       // Indigo - neutral info
    neutral: 0x6b7280,    // Grey - disabled, meta

    // Economy-specific
    gold: 0xfbbf24,       // Currency, treasure
    amethyst: 0x8b5cf6,   // Perks, upgrades
    obsidian: 0x18181b,   // Bank, secure
    emerald: 0x22c55e,    // Gains, bonuses
    ruby: 0xdc2626,       // Losses, fees
} as const;

export type UIColor = keyof typeof UIColors;

/**
 * Get the appropriate color for an operation result.
 */
export function getResultColor(success: boolean): number {
    return success ? UIColors.success : UIColors.error;
}

/**
 * Get color based on account status.
 */
export function getStatusColor(status: "ok" | "blocked" | "banned"): number {
    switch (status) {
        case "ok": return UIColors.success;
        case "blocked": return UIColors.warning;
        case "banned": return UIColors.error;
        default: return UIColors.neutral;
    }
}

// ============================================================================
// EMOJI CONSTANTS
// ============================================================================

/**
 * Standard emoji set for consistent iconography.
 */
export const Emoji = {
    // State indicators
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "ℹ️",
    loading: "⏳",
    clock: "⏰",

    // Economy
    coins: "💰",
    hand: "🫴",
    bank: "🏦",
    diamond: "💎",
    gift: "🎁",
    fire: "🔥",
    star: "⭐",
    trophy: "🏆",

    // Actions
    work: "💼",
    store: "🏪",
    cart: "🛒",
    inventory: "🎒",
    craft: "🔨",
    equip: "👤",

    // Progress
    bar_filled: "█",
    bar_empty: "░",
    bar_full_alt: "▓",

    // Markers
    primary: "◈",
    secondary: "◇",
    tertiary: "·",
    check: "✓",
    cross: "✕",
    arrow_right: "→",
    arrow_left: "←",

    // Categories
    weapon: "⚔️",
    armor: "🛡️",
    accessory: "💍",
    consumable: "🧪",
    material: "🪨",

    // Other
    profile: "👤",
    achievement: "🏆",
    quest: "📜",
    perk: "🎖️",
    settings: "⚙️",
    help: "📖",
} as const;

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format a number with locale separators in monospace.
 * Returns: `12,450`
 */
export function formatMoney(n: number): string {
    return `\`${Math.trunc(n).toLocaleString("en-US")}\``;
}

/**
 * Format a raw number with locale separators (no backticks).
 */
export function formatNumber(n: number): string {
    return Math.trunc(n).toLocaleString("en-US");
}

/**
 * Format a number with currency unit.
 * Returns: `12,450 coins`
 */
export function formatCoins(n: number): string {
    return `\`${formatNumber(n)}\` coins`;
}

/**
 * Format a percentage.
 * Returns: 85%
 */
export function formatPercent(n: number, decimals = 0): string {
    return `${n.toFixed(decimals)}%`;
}

/**
 * Format a level display.
 * Returns: `Lv.12`
 */
export function formatLevel(n: number): string {
    return `\`Lv.${n}\``;
}

/**
 * Format a change with sign.
 * Returns: +1,200 or -500
 */
export function formatDelta(n: number): string {
    const sign = n >= 0 ? "+" : "";
    return `${sign}${formatNumber(n)}`;
}

/**
 * Format a balance change: before → after (+delta)
 */
export function formatBalanceChange(before: number, after: number): string {
    const delta = after - before;
    const deltaStr = formatDelta(delta);
    return `\`${formatNumber(before)}\` → \`${formatNumber(after)}\` (${deltaStr})`;
}

/**
 * Render a progress bar.
 * @param percent 0-100
 * @param length Number of characters (default 10)
 * @returns █████░░░░░
 */
export function renderProgressBar(
    percent: number,
    length = 10,
    filled = Emoji.bar_filled,
    empty = Emoji.bar_empty,
): string {
    const clamped = Math.max(0, Math.min(100, percent));
    const filledCount = Math.round((clamped / 100) * length);
    return filled.repeat(filledCount) + empty.repeat(length - filledCount);
}

/**
 * Format relative time (days ago).
 */
export function formatDaysAgo(days: number): string {
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return `${days} days ago`;
}

/**
 * Format a countdown duration.
 * @param ms Milliseconds remaining
 * @returns "3h 24m" or "in 45m"
 */
export function formatCountdown(ms: number): string {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
        return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
}

/**
 * Generate a reference code for footer.
 * @param prefix Optional prefix like "TXN", "DAY", "ROB"
 */
export function generateRefCode(prefix = "REF"): string {
    const random = Math.random().toString(36).substring(2, 7);
    return `${prefix}-${random}`;
}

// ============================================================================
// EMBED BUILDER UTILITIES
// ============================================================================

export interface EmbedOptions {
    /** Show ref code in footer */
    showRef?: boolean;
    /** Custom ref code (auto-generated if showRef true) */
    refCode?: string;
    /** Hint text for footer */
    hint?: string;
    /** Timestamp */
    timestamp?: Date;
}

/**
 * Build a footer string with optional ref and hint.
 */
export function buildFooter(options: EmbedOptions = {}): string {
    const parts: string[] = [];

    if (options.showRef || options.refCode) {
        parts.push(`Ref: ${options.refCode ?? generateRefCode()}`);
    }

    if (options.hint) {
        parts.push(`💡 ${options.hint}`);
    }

    return parts.join(" • ");
}

/**
 * Create a standard 3-column inline field row.
 */
export function createStatRow(
    field1: { name: string; value: string },
    field2: { name: string; value: string },
    field3: { name: string; value: string },
): APIEmbedField[] {
    return [
        { name: field1.name, value: field1.value, inline: true },
        { name: field2.name, value: field2.value, inline: true },
        { name: field3.name, value: field3.value, inline: true },
    ];
}

// ============================================================================
// STANDARD EMBED BUILDERS
// ============================================================================

/**
 * Build a success result embed.
 */
export function buildSuccessEmbed(params: {
    title: string;
    description?: string;
    fields?: APIEmbedField[];
    options?: EmbedOptions;
}): Embed {
    const embed = new Embed()
        .setColor(UIColors.success)
        .setTitle(`${Emoji.success} ${params.title}`);

    if (params.description) {
        embed.setDescription(params.description);
    }

    if (params.fields?.length) {
        embed.setFields(params.fields);
    }

    const footer = buildFooter(params.options);
    if (footer) {
        embed.setFooter({ text: footer });
    }

    if (params.options?.timestamp) {
        embed.setTimestamp(params.options.timestamp);
    }

    return embed;
}

/**
 * Build an error embed with solution hint.
 */
export function buildErrorEmbed(params: {
    title?: string;
    message: string;
    solution?: string;
    options?: EmbedOptions;
}): Embed {
    const { title = "Error", message, solution, options = {} } = params;

    let description = message;
    if (solution) {
        description += `\n\n💡 ${solution}`;
    }

    const embed = new Embed()
        .setColor(UIColors.error)
        .setTitle(`${Emoji.error} ${title}`)
        .setDescription(description);

    const footer = buildFooter(options);
    if (footer) {
        embed.setFooter({ text: footer });
    }

    return embed;
}

/**
 * Build a warning/caution embed.
 */
export function buildWarningEmbed(params: {
    title?: string;
    message: string;
    fields?: APIEmbedField[];
    options?: EmbedOptions;
}): Embed {
    const { title = "Warning", message, fields = [], options = {} } = params;

    const embed = new Embed()
        .setColor(UIColors.warning)
        .setTitle(`${Emoji.warning} ${title}`)
        .setDescription(message);

    if (fields.length) {
        embed.setFields(fields);
    }

    const footer = buildFooter(options);
    if (footer) {
        embed.setFooter({ text: footer });
    }

    return embed;
}

/**
 * Build an info/neutral embed.
 */
export function buildInfoEmbed(params: {
    title: string;
    description?: string;
    fields?: APIEmbedField[];
    options?: EmbedOptions;
}): Embed {
    const embed = new Embed()
        .setColor(UIColors.info)
        .setTitle(`${Emoji.info} ${params.title}`);

    if (params.description) {
        embed.setDescription(params.description);
    }

    if (params.fields?.length) {
        embed.setFields(params.fields);
    }

    const footer = buildFooter(params.options);
    if (footer) {
        embed.setFooter({ text: footer });
    }

    return embed;
}

// ============================================================================
// ECONOMY-SPECIFIC BUILDERS
// ============================================================================

export interface TransactionResult {
    type: "daily" | "work" | "buy" | "sell" | "transfer" | "coinflip" | "rob";
    success: boolean;
    amount: number;
    fee?: number;
    bonus?: number;
    netAmount: number;
    balanceBefore: number;
    balanceAfter: number;
    refCode?: string;
}

/**
 * Build a transaction result embed with breakdown.
 */
export function buildTransactionEmbed(params: {
    title: string;
    description?: string;
    result: TransactionResult;
    extraFields?: APIEmbedField[];
    hint?: string;
}): Embed {
    const { title, description, result, extraFields = [], hint } = params;

    const emoji = result.success ? Emoji.success : Emoji.error;
    const color = result.success ? UIColors.success : UIColors.error;

    const embed = new Embed()
        .setColor(color)
        .setTitle(`${emoji} ${title}`);

    if (description) {
        embed.setDescription(description);
    }

    const fields: APIEmbedField[] = [];

    // Breakdown section
    const breakdownLines: string[] = [];
    breakdownLines.push(`Base: ${formatNumber(result.amount)}`);
    if (result.bonus && result.bonus > 0) {
        breakdownLines.push(`Bonus: +${formatNumber(result.bonus)}`);
    }
    if (result.fee && result.fee > 0) {
        breakdownLines.push(`Fee: -${formatNumber(result.fee)}`);
    }
    breakdownLines.push(`───────────`);
    breakdownLines.push(`**Net: ${formatNumber(result.netAmount)}**`);

    fields.push({
        name: "📊 Breakdown",
        value: breakdownLines.join("\n"),
        inline: false,
    });

    // Balance change
    fields.push({
        name: "💰 Balance",
        value: formatBalanceChange(result.balanceBefore, result.balanceAfter),
        inline: false,
    });

    // Extra fields
    fields.push(...extraFields);

    embed.setFields(fields);

    // Footer
    const footerParts: string[] = [];
    if (result.refCode) {
        footerParts.push(`Ref: ${result.refCode}`);
    }
    if (hint) {
        footerParts.push(`💡 ${hint}`);
    }
    if (footerParts.length) {
        embed.setFooter({ text: footerParts.join(" • ") });
    }

    return embed;
}

/**
 * Build a profile embed with the VOID ARCHIVE style.
 */
export function buildProfileEmbed(params: {
    username: string;
    avatarUrl?: string;
    status: "ok" | "blocked" | "banned";
    level: number;
    xp: number;
    xpToNext: number;
    progressPercent: number;
    balance: number;
    bankBalance: number;
    reputation: number;
    inventoryCount: number;
    achievementProgress: { unlocked: number; total: number };
    equippedTitle?: string;
    equippedBadges?: string[];
    daysSinceCreated: number;
}): Embed {
    const p = params;

    const embed = new Embed()
        .setColor(getStatusColor(p.status))
        .setTitle(`${Emoji.profile} Economy Profile`);

    if (p.avatarUrl) {
        embed.setAuthor({ name: p.username, iconUrl: p.avatarUrl });
    } else {
        embed.setAuthor({ name: p.username });
    }

    // Title and badges line
    let headerLine = `Account active • Member since ${formatDaysAgo(p.daysSinceCreated)}`;
    if (p.equippedTitle) {
        headerLine = `🎖️ ${p.equippedTitle}\n${headerLine}`;
    }
    embed.setDescription(headerLine);

    const fields: APIEmbedField[] = [];

    // Row 1: Level, Balance, Bank
    fields.push(
        { name: "📊 Level", value: formatLevel(p.level), inline: true },
        { name: "💰 Balance", value: formatCoins(p.balance), inline: true },
        { name: "🏦 Bank", value: formatCoins(p.bankBalance), inline: true },
    );

    // Progress bar
    const bar = renderProgressBar(p.progressPercent);
    fields.push({
        name: "📈 Progress",
        value: `${bar} ${formatPercent(p.progressPercent)} — \`${formatNumber(p.xp)}\` / \`${formatNumber(p.xpToNext)}\` XP`,
        inline: false,
    });

    // Row 2: Rep, Inventory, Achievements
    const achievePct = Math.round((p.achievementProgress.unlocked / p.achievementProgress.total) * 100);
    fields.push(
        { name: "⭐ Reputation", value: `\`${p.reputation >= 0 ? "+" : ""}${p.reputation}\``, inline: true },
        { name: "🎒 Inventory", value: `${p.inventoryCount} items`, inline: true },
        {
            name: "🏆 Achievements",
            value: `${p.achievementProgress.unlocked}/${p.achievementProgress.total} (${achievePct}%)`,
            inline: true,
        },
    );

    embed.setFields(fields);
    embed.setFooter({ text: "💡 /balance • /inventory • /achievements for details" });

    return embed;
}

/**
 * Build a daily claim result embed.
 */
export function buildDailyEmbed(params: {
    baseAmount: number;
    streakBonus: number;
    fee?: number;
    netAmount: number;
    streak: number;
    bestStreak: number;
    balanceBefore: number;
    balanceAfter: number;
    refCode: string;
    leveledUp?: { newLevel: number };
}): Embed {
    const p = params;

    const embed = new Embed()
        .setColor(UIColors.gold)
        .setTitle(`${Emoji.gift} Daily Claimed`);

    // Hero line
    embed.setDescription(`${Emoji.primary} **+${formatNumber(p.netAmount)} coins** collected from the void`);

    const fields: APIEmbedField[] = [];

    // Breakdown
    const breakdownLines = [
        `Base reward: \`${formatNumber(p.baseAmount)}\``,
    ];
    if (p.streakBonus > 0) {
        breakdownLines.push(`Streak bonus: \`+${formatNumber(p.streakBonus)}\` (${p.streak} days ${Emoji.fire})`);
    }
    if (p.fee && p.fee > 0) {
        breakdownLines.push(`Fee: \`-${formatNumber(p.fee)}\``);
    }
    breakdownLines.push(`───────────`);
    breakdownLines.push(`**Net gained:** \`${formatNumber(p.netAmount)}\` coins`);

    fields.push({
        name: "📊 Breakdown",
        value: breakdownLines.join("\n"),
        inline: false,
    });

    // Stats row
    fields.push(
        { name: "💰 Balance", value: formatCoins(p.balanceAfter), inline: true },
        { name: `${Emoji.fire} Streak`, value: `${p.streak} days`, inline: true },
        { name: "🏆 Best Streak", value: `${p.bestStreak} days`, inline: true },
    );

    // Level up notification
    if (p.leveledUp) {
        fields.push({
            name: "🎉 Level Up!",
            value: `You are now ${formatLevel(p.leveledUp.newLevel)}`,
            inline: false,
        });
    }

    embed.setFields(fields);
    embed.setFooter({ text: `Ref: ${p.refCode} • 💡 Return in 24h to continue your streak` });

    return embed;
}

/**
 * Build a store catalog embed.
 */
export function buildStoreCatalogEmbed(params: {
    featured?: Array<{
        name: string;
        originalPrice: number;
        salePrice: number;
        discountPct: number;
        stock: number | "unlimited";
        emoji?: string;
    }>;
    categories: Array<{
        name: string;
        emoji: string;
        items: Array<{
            id: string;
            name: string;
            price: number;
            stock: number | "unlimited";
        }>;
    }>;
    page: number;
    totalPages: number;
}): Embed {
    const p = params;

    const embed = new Embed()
        .setColor(UIColors.gold)
        .setTitle(`${Emoji.store} Guild Store`);

    const fields: APIEmbedField[] = [];

    // Featured section
    if (p.featured && p.featured.length > 0) {
        const featuredLines = p.featured.map(item => {
            const stockStr = item.stock === "unlimited" ? "∞" : item.stock.toString();
            return `${Emoji.fire} **${item.name}** — ~~${item.originalPrice}~~ \`${item.salePrice}\` coins (${item.discountPct}% OFF)\n   Stock: ${stockStr}`;
        });

        fields.push({
            name: "⭐ FEATURED — Limited Time Deals",
            value: featuredLines.join("\n\n"),
            inline: false,
        });
    }

    // Category sections (max 3 categories shown)
    for (const cat of p.categories.slice(0, 3)) {
        const itemLines = cat.items.slice(0, 4).map(item =>
            `• \`${item.id}\` **${item.name}** — \`${item.price}\` coins`
        );
        if (cat.items.length > 4) {
            itemLines.push(`*...and ${cat.items.length - 4} more*`);
        }

        fields.push({
            name: `${cat.emoji} ${cat.name}`,
            value: itemLines.join("\n"),
            inline: false,
        });
    }

    embed.setFields(fields);
    embed.setFooter({ text: `Page ${p.page}/${p.totalPages} • 💡 /store-buy item:<id> to purchase` });

    return embed;
}

// ============================================================================
// BUTTON BUILDERS
// ============================================================================

/**
 * Create a confirm/cancel button row.
 */
export function createConfirmCancelRow(
    confirmId: string,
    cancelId: string,
    confirmLabel = "✓ Confirm",
    cancelLabel = "✕ Cancel",
): ActionRow<Button> {
    const confirm = new Button()
        .setCustomId(confirmId)
        .setLabel(confirmLabel)
        .setStyle(ButtonStyle.Success);

    const cancel = new Button()
        .setCustomId(cancelId)
        .setLabel(cancelLabel)
        .setStyle(ButtonStyle.Secondary);

    return new ActionRow<Button>().addComponents(confirm, cancel);
}

/**
 * Create a pagination button row.
 */
export function createPaginationRow(
    prevId: string,
    nextId: string,
    page: number,
    totalPages: number,
): ActionRow<Button> {
    const prev = new Button()
        .setCustomId(prevId)
        .setLabel("◀ Prev")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1);

    const indicator = new Button()
        .setCustomId("page_indicator")
        .setLabel(`Page ${page}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

    const next = new Button()
        .setCustomId(nextId)
        .setLabel("Next ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages);

    return new ActionRow<Button>().addComponents(prev, indicator, next);
}

// ============================================================================
// CONFIRMATION EMBED BUILDER
// ============================================================================

/**
 * Build a purchase/action confirmation embed.
 */
export function buildConfirmationEmbed(params: {
    action: string;
    item: string;
    cost: number;
    tax?: number;
    totalCost: number;
    currentBalance: number;
    balanceAfter: number;
    additionalInfo?: string;
}): Embed {
    const p = params;

    const embed = new Embed()
        .setColor(UIColors.warning)
        .setTitle(`${Emoji.cart} Confirm ${p.action}`)
        .setDescription(`${p.action} **${p.item}**?`);

    const fields: APIEmbedField[] = [];

    // Cost breakdown
    fields.push(
        { name: "💰 Price", value: formatCoins(p.cost), inline: true },
    );
    if (p.tax && p.tax > 0) {
        fields.push(
            { name: "🏛️ Tax", value: formatCoins(p.tax), inline: true },
        );
    }
    fields.push(
        { name: "💎 Total", value: formatCoins(p.totalCost), inline: true },
    );

    // Balance change
    fields.push({
        name: "📊 Your balance",
        value: `${formatCoins(p.currentBalance)} → ${formatCoins(p.balanceAfter)}`,
        inline: false,
    });

    if (p.additionalInfo) {
        fields.push({
            name: "📋 Note",
            value: p.additionalInfo,
            inline: false,
        });
    }

    embed.setFields(fields);

    return embed;
}

// ============================================================================
// ERROR MESSAGE PATTERNS
// ============================================================================

/**
 * Standard error messages with solutions.
 */
export const ErrorMessages = {
    insufficientFunds: (required: number, available: number) => ({
        title: "Insufficient Funds",
        message: `You need \`${formatNumber(required)}\` coins but only have \`${formatNumber(available)}\`.`,
        solution: "Try /work or /daily to earn more coins.",
    }),

    itemNotFound: (itemId: string) => ({
        title: "Item Not Found",
        message: `Item "${itemId}" was not found.`,
        solution: "Use /inventory to see your items.",
    }),

    alreadyClaimed: (waitTime: string) => ({
        title: "Already Claimed",
        message: `You've already claimed this reward.`,
        solution: `Come back in ${waitTime}.`,
    }),

    accountRestricted: () => ({
        title: "Account Restricted",
        message: "Your account has restrictions preventing this action.",
        solution: "Contact staff for more information.",
    }),

    inventoryFull: () => ({
        title: "Inventory Full",
        message: "You don't have enough inventory space.",
        solution: "Sell or discard items to make room.",
    }),

    guildOnly: () => ({
        title: "Server Only",
        message: "This command can only be used in a server.",
        solution: undefined,
    }),
} as const;

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    UIColors,
    Emoji,
    formatMoney,
    formatNumber,
    formatCoins,
    formatPercent,
    formatLevel,
    formatDelta,
    formatBalanceChange,
    formatDaysAgo,
    formatCountdown,
    renderProgressBar,
    generateRefCode,
    buildFooter,
    createStatRow,
    buildSuccessEmbed,
    buildErrorEmbed,
    buildWarningEmbed,
    buildInfoEmbed,
    buildTransactionEmbed,
    buildProfileEmbed,
    buildDailyEmbed,
    buildStoreCatalogEmbed,
    buildConfirmationEmbed,
    createConfirmCancelRow,
    createPaginationRow,
    ErrorMessages,
};
