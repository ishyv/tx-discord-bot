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
import { UIColors } from "@/modules/ui/design-system";

// ============================================================================
// Utility Formatters
// ============================================================================

/** Format a number with locale separators. */
export function formatNumber(n: number): string {
  return Math.trunc(n).toLocaleString("en-US");
}

/** Format a number with code block styling for embeds. */
export function formatMoney(n: number): string {
  return `\`${formatNumber(n)}\``;
}

/** Format coins with unit. */
export function formatCoins(n: number): string {
  return `\`${formatNumber(n)}\` coins`;
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

/**
 * Create a progress bar visualization.
 * @param percent 0-100 value
 * @param length Number of bar characters (default 10 per style guide)
 * @param filled Character for filled portion (default █)
 * @param empty Character for empty portion (default ░)
 */
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

/** Format a delta with +/- sign. */
export function formatDelta(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${formatNumber(n)}`;
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

/** Build a balance embed with VOID ARCHIVE styling. */
export function buildBalanceEmbed(
  view: BalanceView,
  username: string,
  avatarUrl?: string,
): Embed {
  const embed = new Embed()
    .setColor(UIColors.gold)
    .setTitle("💰 Your Balance")
    .setFields(buildBalanceFields(view));

  if (avatarUrl) {
    embed.setAuthor({ name: username, iconUrl: avatarUrl });
  } else {
    embed.setAuthor({ name: username });
  }

  // Add navigation hint in footer
  embed.setFooter({ text: "💡 /deposit • /withdraw • /bank for transactions" });

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

/** Build a bank breakdown embed with VOID ARCHIVE styling. */
export function buildBankEmbed(
  view: BankBreakdownView,
  username: string,
  avatarUrl?: string,
): Embed {
  const embed = new Embed()
    .setColor(view.isEmpty ? UIColors.neutral : UIColors.gold)
    .setTitle("🏦 Bank Overview")
    .setDescription("Your coins are safer in the bank. Protected from theft.");

  embed.setFields(buildBankFields(view));

  if (avatarUrl) {
    embed.setAuthor({ name: username, iconUrl: avatarUrl });
  } else {
    embed.setAuthor({ name: username });
  }

  // Footer with security info and navigation hint
  const footerText = !view.isEmpty
    ? `Security: ${formatPercent(view.percentInBank)} saved • 💡 Higher % = safer from /rob`
    : "💡 /deposit <amount> to save coins";
  embed.setFooter({ text: footerText });

  return embed;
}

// ============================================================================
// Inventory Formatters
// ============================================================================

/** Build a single inventory item line. */
/** Build a single inventory item line. */
export function buildInventoryItemLine(
  item: InventoryPageView["items"][number],
  showDescription = false,
): string {
  const emoji = item.emoji || "📦";
  const name = item.name || item.id;

  if (item.isInstanceBased && item.instances && item.instances.length > 0) {
    return item.instances
      .map((inst) => {
        const shortId = inst.instanceId.slice(-6);
        const max = inst.maxDurability || 100;
        const percent = (inst.durability / max) * 100;
        const bar = renderProgressBar(percent, 5);
        return `${emoji} **${name}** \`#${shortId}\` ${bar} \`${inst.durability}/${max}\``;
      })
      .join("\n");
  }

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

/**
 * Build a profile summary embed with VOID ARCHIVE styling.
 * Uses compact 3-column grids and code-formatted numbers.
 */
export function buildProfileEmbed(
  view: ProfileSummaryView,
  username: string,
  avatarUrl?: string,
  achievementsData?: ProfileAchievementsData,
): Embed {
  const embed = new Embed()
    .setColor(getStatusColor(view.account.status))
    .setTitle("👤 Economy Profile");

  if (avatarUrl) {
    embed.setAuthor({ name: username, iconUrl: avatarUrl });
  } else {
    embed.setAuthor({ name: username });
  }

  // Build header description with title and badges
  let headerLines: string[] = [];

  if (achievementsData?.equippedTitle) {
    let titleDisplay = achievementsData.equippedTitle.displayName;
    if (achievementsData.equippedTitle.prefix) {
      titleDisplay = `${achievementsData.equippedTitle.prefix}${titleDisplay}`;
    }
    if (achievementsData.equippedTitle.suffix) {
      titleDisplay = `${titleDisplay}${achievementsData.equippedTitle.suffix}`;
    }
    headerLines.push(`🎖️ ${titleDisplay}`);
  }

  if (achievementsData && achievementsData.equippedBadges.length > 0) {
    const badgeDisplay = achievementsData.equippedBadges
      .map((b) => b.emoji)
      .join(" ");
    headerLines.push(badgeDisplay);
  }

  headerLines.push(`Account ${getStatusDisplay(view.account.status).toLowerCase()} • Member since ${formatDaysAgo(view.account.daysSinceCreated)}`);

  embed.setDescription(headerLines.join("\n"));

  const fields: APIEmbedField[] = [];

  // Row 1: Level, Balance, Bank (3-column grid)
  const levelValue = view.progression
    ? `\`Lv.${view.progression.level}\``
    : "`Lv.0`";

  const balanceValue = view.balances.primaryCurrency
    ? `\`${view.balances.primaryCurrency.display}\``
    : "`0` coins";

  const bankValue = view.bank && !view.bank.isEmpty
    ? `\`${formatNumber(view.bank.total)}\` coins`
    : "*Empty*";

  fields.push(
    { name: "📊 Level", value: levelValue, inline: true },
    { name: "💰 Balance", value: balanceValue, inline: true },
    { name: "🏦 Bank", value: bankValue, inline: true },
  );

  // Progress bar (full width)
  if (view.progression) {
    const progress = view.progression;
    const bar = renderProgressBar(progress.progressPercent);
    const xpNeeded = (progress.nextLevelXP ?? 0) - progress.currentLevelXP;
    const nextStep = progress.isMaxLevel
      ? "Max level reached"
      : `\`${formatNumber(progress.progressToNext)}\` / \`${formatNumber(xpNeeded)}\` XP to next`;

    fields.push({
      name: "📈 Progress",
      value: `${bar} ${formatPercent(progress.progressPercent)} — ${nextStep}`,
      inline: false,
    });
  }

  // Row 2: Rep, Inventory, Achievements (3-column grid)
  const repSign = view.reputation >= 0 ? "+" : "";
  const repValue = `\`${repSign}${view.reputation}\``;

  const invValue = !view.inventory.isEmpty
    ? `${view.inventory.uniqueItems} items`
    : "*Empty*";

  let achieveValue = "0/0";
  if (achievementsData) {
    const percent = Math.round(
      (achievementsData.unlockedCount / achievementsData.totalCount) * 100,
    );
    achieveValue = `${achievementsData.unlockedCount}/${achievementsData.totalCount} (${percent}%)`;
  }

  fields.push(
    { name: "⭐ Reputation", value: repValue, inline: true },
    { name: "🎒 Inventory", value: invValue, inline: true },
    { name: "🏆 Achievements", value: achieveValue, inline: true },
  );

  embed.setFields(fields);

  // Footer with navigation hints
  embed.setFooter({ text: "💡 /balance • /inventory • /achievements for details" });

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
