/**
 * Economy Account Formatting Utilities.
 *
 * Purpose: Centralize embed/message formatting for economy outputs.
 * Context: Used by commands to render consistent, localized economy UI.
 * Dependencies: Seyfert Embed, economy view types.
 *
 * Invariants:
 * - All formatters are pure functions (no side effects).
 * - No sensitive data (mod reasons) are exposed in messages.
 * - Blocked/banned accounts show generic messages without details.
 * - All embeds use consistent styling (colors, emojis, structure).
 *
 * Gotchas:
 * - Message content for blocked/banned accounts is intentionally vague.
 * - Empty states use helpful CTAs when appropriate.
 */

import { Embed } from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import type { APIEmbedField } from "seyfert/lib/types";
import {
  type EconomyAccountView,
  type BalanceView,
  type BankBreakdownView,
  type InventorySummaryView,
  type InventoryPageView,
  type ProfileSummaryView,
  type CurrencyBalanceView,
  ACCOUNT_STATUS_DISPLAY,
} from "./types";

// ============================================================================
// Utility Formatters
// ============================================================================

/** Format a number with locale separators. */
export function formatNumber(n: number): string {
  return Math.trunc(n).toLocaleString("en-US");
}

/** Format a relative time (days ago). */
export function formatDaysAgo(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

/** Format percentage with 1 decimal place. */
export function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

/** Create a progress bar visualization. */
export function renderProgressBar(
  percent: number,
  length = 10,
  filled = "█",
  empty = "░",
): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filledCount = Math.round((clamped / 100) * length);
  const emptyCount = length - filledCount;
  return filled.repeat(filledCount) + empty.repeat(emptyCount);
}

// ============================================================================
// Account Status Formatters
// ============================================================================

/**
 * Get the display string for an account status.
 * Safe for public display.
 */
export function getStatusDisplay(status: EconomyAccountView["status"]): string {
  return ACCOUNT_STATUS_DISPLAY[status] ?? "❓ Unknown";
}

/**
 * Get the embed color for an account status.
 */
export function getStatusColor(status: EconomyAccountView["status"]): number {
  switch (status) {
    case "ok":
      return EmbedColors.Green;
    case "blocked":
      return EmbedColors.Yellow;
    case "banned":
      return EmbedColors.Red;
    default:
      return EmbedColors.Grey;
  }
}

/**
 * Check if account can access economy features.
 */
export function canAccessEconomy(
  status: EconomyAccountView["status"],
): boolean {
  return status === "ok";
}

/**
 * Get user-facing message for blocked/banned accounts.
 * Intentionally vague to avoid leaking moderation details.
 */
export function getAccessDeniedMessage(
  status: EconomyAccountView["status"],
): string {
  switch (status) {
    case "blocked":
      return "⛅ Your account has temporary restrictions. Contact staff for more information.";
    case "banned":
      return "🚫 Your account has permanent restrictions. Contact staff if you think this is an error.";
    default:
      return "❌ You cannot access the economy at this time.";
  }
}

// ============================================================================
// Balance Formatters
// ============================================================================

/** Build fields for balance display. */
export function buildBalanceFields(view: BalanceView): APIEmbedField[] {
  const fields: APIEmbedField[] = [];

  // Show visible currencies
  for (const currency of view.currencies) {
    fields.push({
      name: currency.name,
      value: currency.display,
      inline: true,
    });
  }

  // Show "and X more" if currencies are hidden
  if (view.hiddenCount > 0) {
    fields.push({
      name: "💎 More currencies",
      value: `And ${view.hiddenCount} more currency(ies). Use \`/balance detailed\` to see all.`,
      inline: false,
    });
  }

  // If no currencies shown at all
  if (fields.length === 0) {
    fields.push({
      name: "💰 Balance",
      value: "You have no registered currencies.",
      inline: false,
    });
  }

  return fields;
}

/** Build a balance embed. */
export function buildBalanceEmbed(
  view: BalanceView,
  username: string,
  avatarUrl?: string,
): Embed {
  const embed = new Embed()
    .setColor(EmbedColors.Blurple)
    .setTitle("💰 Your Balance")
    .setFields(buildBalanceFields(view));

  if (avatarUrl) {
    embed.setAuthor({ name: username, iconUrl: avatarUrl });
  } else {
    embed.setAuthor({ name: username });
  }

  return embed;
}

/** Build a compact balance line for inline display. */
export function buildCompactBalanceLine(currency: CurrencyBalanceView): string {
  return `${currency.name}: ${currency.display}`;
}

// ============================================================================
// Bank Formatters
// ============================================================================

/** Build fields for bank breakdown. */
export function buildBankFields(view: BankBreakdownView): APIEmbedField[] {
  if (view.isEmpty) {
    return [
      {
        name: "💳 Bank",
        value: "You have no coins saved.",
        inline: false,
      },
    ];
  }

  const bar = renderProgressBar(view.percentInBank);

  return [
    {
      name: "🫴 In Hand",
      value: `${formatNumber(view.hand)} coins`,
      inline: true,
    },
    {
      name: "💳 In Bank",
      value: `${formatNumber(view.bank)} coins`,
      inline: true,
    },
    {
      name: "💰 Total",
      value: `${formatNumber(view.total)} coins`,
      inline: true,
    },
    {
      name: "📊 Distribution",
      value: `${bar} ${formatPercent(view.percentInBank)} in bank`,
      inline: false,
    },
  ];
}

/** Build a bank breakdown embed. */
export function buildBankEmbed(
  view: BankBreakdownView,
  username: string,
  avatarUrl?: string,
): Embed {
  const embed = new Embed()
    .setColor(view.isEmpty ? EmbedColors.Grey : EmbedColors.Gold)
    .setTitle("🏦 Bank Breakdown")
    .setFields(buildBankFields(view));

  if (avatarUrl) {
    embed.setAuthor({ name: username, iconUrl: avatarUrl });
  } else {
    embed.setAuthor({ name: username });
  }

  if (!view.isEmpty) {
    embed.setFooter({
      text: `Bank security: ${formatPercent(view.percentInBank)}`,
    });
  }

  return embed;
}

// ============================================================================
// Inventory Formatters
// ============================================================================

/** Build a single inventory item line. */
export function buildInventoryItemLine(
  item: InventoryPageView["items"][number],
  showDescription = false,
): string {
  const emoji = item.emoji || "📦";
  const name = item.name || item.id;
  let line = `${emoji} **${name}** x${formatNumber(item.quantity)}`;
  if (showDescription && item.description) {
    line += `\n   *${item.description}*`;
  }
  return line;
}

/** Build an inventory page embed. */
export function buildInventoryPageEmbed(
  pageView: InventoryPageView,
  username: string,
  avatarUrl?: string,
): Embed {
  const embed = new Embed()
    .setColor(EmbedColors.Purple)
    .setTitle("🎒 Inventory");

  if (avatarUrl) {
    embed.setAuthor({ name: username, iconUrl: avatarUrl });
  } else {
    embed.setAuthor({ name: username });
  }

  if (pageView.items.length === 0) {
    embed.setDescription("*Empty inventory*");
  } else {
    const lines = pageView.items.map((item) =>
      buildInventoryItemLine(item, false),
    );
    embed.setDescription(lines.join("\n"));
  }

  embed.setFooter({
    text: `Page ${pageView.page + 1} of ${pageView.totalPages} • ${formatNumber(pageView.totalItems)} items`,
  });

  return embed;
}

/** Build an inventory summary embed (compact). */
export function buildInventorySummaryEmbed(
  view: InventorySummaryView,
  username: string,
): Embed {
  const embed = new Embed()
    .setColor(view.isEmpty ? EmbedColors.Grey : EmbedColors.Purple)
    .setTitle("🎒 Inventory Summary")
    .setAuthor({ name: username });

  if (view.isEmpty) {
    embed.setDescription("You have no items in your inventory.");
  } else {
    const lines: string[] = [
      `**Unique items:** ${formatNumber(view.uniqueItems)}`,
      `**Total items:** ${formatNumber(view.totalItems)}`,
      "",
      "**Top items:**",
    ];

    for (const item of view.topItems.slice(0, 5)) {
      const emoji = item.emoji || "📦";
      lines.push(`${emoji} ${item.name}: ${formatNumber(item.quantity)}`);
    }

    embed.setDescription(lines.join("\n"));
  }

  return embed;
}

// ============================================================================
// Profile Formatters
// ============================================================================

/** Profile achievements data for embed display. */
export interface ProfileAchievementsData {
  equippedTitle?: {
    displayName: string;
    prefix?: string;
    suffix?: string;
  };
  equippedBadges: { emoji: string; name: string }[];
  unlockedCount: number;
  totalCount: number;
}

/** Build a profile summary embed. */
export function buildProfileEmbed(
  view: ProfileSummaryView,
  username: string,
  avatarUrl?: string,
  achievementsData?: ProfileAchievementsData,
): Embed {
  const embed = new Embed()
    .setColor(getStatusColor(view.account.status))
    .setTitle("👤 Economy Profile")
    .setDescription(
      `Account ${getStatusDisplay(view.account.status).toLowerCase()}`,
    );

  if (avatarUrl) {
    embed.setAuthor({ name: username, iconUrl: avatarUrl });
  } else {
    embed.setAuthor({ name: username });
  }

  const fields: APIEmbedField[] = [];

  // Account info
  fields.push({
    name: "📅 Account created",
    value: formatDaysAgo(view.account.daysSinceCreated),
    inline: true,
  });

  fields.push({
    name: "⏰ Last activity",
    value: formatDaysAgo(view.account.daysSinceActivity),
    inline: true,
  });

  // Reputation
  fields.push({
    name: "⭐ Reputation",
    value: formatNumber(view.reputation),
    inline: true,
  });

  // Equipped Title
  if (achievementsData?.equippedTitle) {
    let titleDisplay = achievementsData.equippedTitle.displayName;
    if (achievementsData.equippedTitle.prefix) {
      titleDisplay = `${achievementsData.equippedTitle.prefix}${titleDisplay}`;
    }
    if (achievementsData.equippedTitle.suffix) {
      titleDisplay = `${titleDisplay}${achievementsData.equippedTitle.suffix}`;
    }
    fields.push({
      name: "🏷️ Title",
      value: titleDisplay,
      inline: false,
    });
  }

  // Equipped Badges (1-3)
  if (achievementsData && achievementsData.equippedBadges.length > 0) {
    const badgeDisplay = achievementsData.equippedBadges
      .map((b) => `${b.emoji} ${b.name}`)
      .join("\n");
    fields.push({
      name: "🎖️ Badges",
      value: badgeDisplay,
      inline: true,
    });
  }

  // Achievements summary
  if (achievementsData) {
    const percent = Math.round(
      (achievementsData.unlockedCount / achievementsData.totalCount) * 100,
    );
    fields.push({
      name: "🏆 Achievements",
      value: `${achievementsData.unlockedCount}/${achievementsData.totalCount} (${percent}%)\nUse /achievements to see more`,
      inline: true,
    });
  }

  if (view.progression) {
    const progress = view.progression;
    const bar = renderProgressBar(progress.progressPercent);
    const nextStep = progress.isMaxLevel
      ? "Nivel máximo alcanzado"
      : `${formatNumber(progress.progressToNext)} / ${formatNumber(
        (progress.nextLevelXP ?? 0) - progress.currentLevelXP,
      )} XP para subir`;

    fields.push({
      name: "📈 Progress",
      value:
        `Level **${formatNumber(progress.level)}** • ${formatNumber(progress.totalXP)} XP\n` +
        `${bar} ${formatPercent(progress.progressPercent)}\n` +
        nextStep,
      inline: false,
    });
  }

  // Primary balance (if any)
  if (view.balances.primaryCurrency) {
    fields.push({
      name: "💰 Primary balance",
      value: view.balances.primaryCurrency.display,
      inline: false,
    });
  }

  // Bank info (if has coins)
  if (view.bank && !view.bank.isEmpty) {
    fields.push({
      name: "🏦 Total in bank",
      value: `${formatNumber(view.bank.total)} coins (${formatPercent(view.bank.percentInBank)} safe)`,
      inline: true,
    });
  }

  // Inventory summary
  if (!view.inventory.isEmpty) {
    fields.push({
      name: "🎒 Inventory",
      value: `${formatNumber(view.inventory.uniqueItems)} unique items`,
      inline: true,
    });
  }

  embed.setFields(fields);

  const footerText = view.balances.hasMultipleCurrencies
    ? `Use /balance to see all your ${view.balances.currencies.length} currencies`
    : "PyE Economy";

  embed.setFooter({ text: footerText });

  return embed;
}

/** Build a progression embed. */
export function buildProgressEmbed(
  view: ProfileSummaryView["progression"],
  username: string,
  avatarUrl?: string,
  streak?: { currentStreak: number; bestStreak: number } | null,
): Embed {
  const embed = new Embed()
    .setColor(EmbedColors.Blurple)
    .setTitle("🏆 Progress");

  if (avatarUrl) {
    embed.setAuthor({ name: username, iconUrl: avatarUrl });
  } else {
    embed.setAuthor({ name: username });
  }

  const streakLine = streak
    ? `\n\n🔥 Daily streak: **${formatNumber(streak.currentStreak)}** (best ${formatNumber(
      streak.bestStreak,
    )})`
    : "";

  if (!view) {
    embed.setDescription(
      `No progress recorded on this server.${streakLine}`,
    );
    return embed;
  }

  const bar = renderProgressBar(view.progressPercent);
  const nextStep = view.isMaxLevel
    ? "Max level reached"
    : `${formatNumber(view.progressToNext)} / ${formatNumber(
      (view.nextLevelXP ?? 0) - view.currentLevelXP,
    )} XP to level up`;

  embed.setDescription(
    `Nivel **${formatNumber(view.level)}** • ${formatNumber(view.totalXP)} XP\n` +
    `${bar} ${formatPercent(view.progressPercent)}\n` +
    nextStep +
    streakLine,
  );

  return embed;
}

// ============================================================================
// Error/Safety Formatters
// ============================================================================

/** Build an embed for account access denied. */
export function buildAccessDeniedEmbed(
  status: EconomyAccountView["status"],
): Embed {
  return new Embed()
    .setColor(getStatusColor(status))
    .setTitle("⛔ Access Restricted")
    .setDescription(getAccessDeniedMessage(status));
}

/** Build an embed for "account created" notification. */
export function buildAccountCreatedEmbed(username: string): Embed {
  return new Embed()
    .setColor(EmbedColors.Green)
    .setTitle("✅ Account Created")
    .setDescription(
      `Welcome to the bot's capitalist system, ${username}!\n\n` +
      "Your account has been automatically created. Now you can start earning and spending coins.",
    );
}

/** Build an embed for generic error (without leaking details). */
export function buildErrorEmbed(publicMessage: string, logId?: string): Embed {
  const embed = new Embed()
    .setColor(EmbedColors.Red)
    .setTitle("❌ Error")
    .setDescription(publicMessage);

  if (logId) {
    embed.setFooter({ text: `Ref: ${logId}` });
  }

  return embed;
}

/** Build an embed for data corruption warning (admin only). */
export function buildCorruptionWarningEmbed(repairedFields: string[]): Embed {
  return new Embed()
    .setColor(EmbedColors.Yellow)
    .setTitle("⚠️ Data Repaired")
    .setDescription(
      "Corrupt data was detected in your economy account and was automatically repaired.\n\n" +
      `Affected fields: ${repairedFields.join(", ")}`,
    );
}
