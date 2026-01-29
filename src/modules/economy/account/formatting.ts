/**
 * Economy Account Formatting Utilities.
 *
 * Purpose: Centralize embed/message formatting for economy outputs.
 * Encaje: Used by commands to render consistent, localized economy UI.
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
  return Math.trunc(n).toLocaleString("es-ES");
}

/** Format a relative time (days ago). */
export function formatDaysAgo(days: number): string {
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  return `Hace ${days} días`;
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
  return ACCOUNT_STATUS_DISPLAY[status] ?? "❓ Desconocido";
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
export function canAccessEconomy(status: EconomyAccountView["status"]): boolean {
  return status === "ok";
}

/**
 * Get user-facing message for blocked/banned accounts.
 * Intentionally vague to avoid leaking moderation details.
 */
export function getAccessDeniedMessage(status: EconomyAccountView["status"]): string {
  switch (status) {
    case "blocked":
      return "⛅ Tu cuenta tiene restricciones temporales. Contacta al staff para más información.";
    case "banned":
      return "🚫 Tu cuenta tiene restricciones permanentes. Contacta al staff si crees que es un error.";
    default:
      return "❌ No puedes acceder a la economía en este momento.";
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
      name: "💎 Más monedas",
      value: `Y ${view.hiddenCount} moneda(s) más. Usa \`/balance detallado\` para ver todas.`,
      inline: false,
    });
  }

  // If no currencies shown at all
  if (fields.length === 0) {
    fields.push({
      name: "💰 Balance",
      value: "No tienes monedas registradas.",
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
    .setTitle("💰 Tu Balance")
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
        name: "💳 Banco",
        value: "No tienes coins guardados.",
        inline: false,
      },
    ];
  }

  const bar = renderProgressBar(view.percentInBank);

  return [
    {
      name: "🫴 En Mano",
      value: `${formatNumber(view.hand)} coins`,
      inline: true,
    },
    {
      name: "💳 En Banco",
      value: `${formatNumber(view.bank)} coins`,
      inline: true,
    },
    {
      name: "💰 Total",
      value: `${formatNumber(view.total)} coins`,
      inline: true,
    },
    {
      name: "📊 Distribución",
      value: `${bar} ${formatPercent(view.percentInBank)} en banco`,
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
    .setTitle("🏦 Desglose Bancario")
    .setFields(buildBankFields(view));

  if (avatarUrl) {
    embed.setAuthor({ name: username, iconUrl: avatarUrl });
  } else {
    embed.setAuthor({ name: username });
  }

  if (!view.isEmpty) {
    embed.setFooter({ text: `Seguridad bancaria: ${formatPercent(view.percentInBank)}` });
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
    .setTitle("🎒 Inventario");

  if (avatarUrl) {
    embed.setAuthor({ name: username, iconUrl: avatarUrl });
  } else {
    embed.setAuthor({ name: username });
  }

  if (pageView.items.length === 0) {
    embed.setDescription("*Inventario vacío*");
  } else {
    const lines = pageView.items.map((item) => buildInventoryItemLine(item, false));
    embed.setDescription(lines.join("\n"));
  }

  embed.setFooter({
    text: `Página ${pageView.page + 1} de ${pageView.totalPages} • ${formatNumber(pageView.totalItems)} objetos`,
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
    .setTitle("🎒 Resumen de Inventario")
    .setAuthor({ name: username });

  if (view.isEmpty) {
    embed.setDescription("No tienes objetos en tu inventario.");
  } else {
    const lines: string[] = [
      `**Objetos únicos:** ${formatNumber(view.uniqueItems)}`,
      `**Total de items:** ${formatNumber(view.totalItems)}`,
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

/** Build a profile summary embed. */
export function buildProfileEmbed(
  view: ProfileSummaryView,
  username: string,
  avatarUrl?: string,
): Embed {
  const embed = new Embed()
    .setColor(getStatusColor(view.account.status))
    .setTitle("👤 Perfil Económico")
    .setDescription(`Cuenta ${getStatusDisplay(view.account.status).toLowerCase()}`);

  if (avatarUrl) {
    embed.setAuthor({ name: username, iconUrl: avatarUrl });
  } else {
    embed.setAuthor({ name: username });
  }

  const fields: APIEmbedField[] = [];

  // Account info
  fields.push({
    name: "📅 Cuenta creada",
    value: formatDaysAgo(view.account.daysSinceCreated),
    inline: true,
  });

  fields.push({
    name: "⏰ Última actividad",
    value: formatDaysAgo(view.account.daysSinceActivity),
    inline: true,
  });

  // Reputation
  fields.push({
    name: "⭐ Reputación",
    value: formatNumber(view.reputation),
    inline: true,
  });

  // Primary balance (if any)
  if (view.balances.primaryCurrency) {
    fields.push({
      name: "💰 Balance principal",
      value: view.balances.primaryCurrency.display,
      inline: false,
    });
  }

  // Bank info (if has coins)
  if (view.bank && !view.bank.isEmpty) {
    fields.push({
      name: "🏦 Total en banco",
      value: `${formatNumber(view.bank.total)} coins (${formatPercent(view.bank.percentInBank)} seguro)`,
      inline: true,
    });
  }

  // Inventory summary
  if (!view.inventory.isEmpty) {
    fields.push({
      name: "🎒 Inventario",
      value: `${formatNumber(view.inventory.uniqueItems)} objetos únicos`,
      inline: true,
    });
  }

  embed.setFields(fields);

  const footerText = view.balances.hasMultipleCurrencies
    ? `Usa /balance para ver todas tus ${view.balances.currencies.length} monedas`
    : "Economía PyE";

  embed.setFooter({ text: footerText });

  return embed;
}

// ============================================================================
// Error/Safety Formatters
// ============================================================================

/** Build an embed for account access denied. */
export function buildAccessDeniedEmbed(status: EconomyAccountView["status"]): Embed {
  return new Embed()
    .setColor(getStatusColor(status))
    .setTitle("⛔ Acceso Restringido")
    .setDescription(getAccessDeniedMessage(status));
}

/** Build an embed for "account created" notification. */
export function buildAccountCreatedEmbed(username: string): Embed {
  return new Embed()
    .setColor(EmbedColors.Green)
    .setTitle("✅ Cuenta Creada")
    .setDescription(
      `¡Bienvenido al sistema capitalista del bot, ${username}!\n\n` +
      "Tu cuenta ha sido creada automáticamente. Ahora puedes empezar a ganar y gastar monedas.",
    );
}

/** Build an embed for generic error (without leaking details). */
export function buildErrorEmbed(
  publicMessage: string,
  logId?: string,
): Embed {
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
export function buildCorruptionWarningEmbed(
  repairedFields: string[],
): Embed {
  return new Embed()
    .setColor(EmbedColors.Yellow)
    .setTitle("⚠️ Datos Reparados")
    .setDescription(
      "Se detectaron datos corruptos en tu cuenta económica y fueron reparados automáticamente.\n\n" +
      `Campos afectados: ${repairedFields.join(", ")}`,
    );
}
