/**
 * Economy Transaction Embed Builders.
 *
 * Purpose: Consistent embed formatting for economy operation results.
 * Encaje: Used by all economy commands to render cohesive UI.
 *
 * Design Principles:
 * - Success = Green, Error = Red, Info = Blue, Warning = Yellow
 * - Always show before/after for mutations
 * - Always show fees/taxes separately
 * - Correlation ID in footer (mod-only mode available)
 * - Breakdown fields for transparency
 *
 * Note: These are specialized builders that extend the base formatters in formatting.ts
 */

import { Embed } from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import type { APIEmbedField } from "seyfert/lib/types";
import { formatNumber } from "./formatting";

// ============================================================================
// Types
// ============================================================================

export interface TransactionBreakdown {
  /** Base amount before any modifiers */
  baseAmount: number;
  /** Bonus amount (positive) */
  bonus?: number;
  /** Fee amount (negative, shown as positive in display) */
  fee?: number;
  /** Tax amount (negative, shown as positive in display) */
  tax?: number;
  /** Final net amount */
  netAmount: number;
  /** Currency ID for display */
  currencyId: string;
  /** Currency display formatter */
  display: (n: number) => string;
}

export interface BalanceChange {
  before: number;
  after: number;
  delta: number;
  currencyId: string;
  display: (n: number) => string;
}

export interface EmbedBuilderOptions {
  /** Include correlation ID in footer */
  showCorrelationId?: boolean;
  /** Correlation ID to display */
  correlationId?: string;
  /** Additional footer text */
  footerText?: string;
  /** Timestamp for the embed */
  timestamp?: Date;
}

// ============================================================================
// Utility Functions
// ============================================================================

/** Format a change with +/- sign and color indicator */
export function formatChange(
  value: number,
  display: (n: number) => string,
): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${display(value)}`;
}

/** Build a breakdown field string */
export function buildBreakdownLines(breakdown: TransactionBreakdown): string {
  const lines: string[] = [];

  lines.push(`Base: ${breakdown.display(breakdown.baseAmount)}`);

  if (breakdown.bonus && breakdown.bonus > 0) {
    lines.push(`Bonus: +${breakdown.display(breakdown.bonus)}`);
  }

  if (breakdown.fee && breakdown.fee > 0) {
    lines.push(`Fee: -${breakdown.display(breakdown.fee)}`);
  }

  if (breakdown.tax && breakdown.tax > 0) {
    lines.push(`Tax: -${breakdown.display(breakdown.tax)}`);
  }

  lines.push(`**Net: ${breakdown.display(breakdown.netAmount)}**`);

  return lines.join("\n");
}

// ============================================================================
// Result Embeds
// ============================================================================

/**
 * Build a success embed for a transaction result.
 * Shows before/after, breakdown, and net change.
 */
export function buildResultEmbed(params: {
  title: string;
  description?: string;
  emoji?: string;
  change: BalanceChange;
  breakdown?: TransactionBreakdown;
  extraFields?: APIEmbedField[];
  options?: EmbedBuilderOptions;
}): Embed {
  const {
    title,
    description,
    emoji = "✅",
    change,
    breakdown,
    extraFields = [],
    options = {},
  } = params;

  const embed = new Embed()
    .setColor(EmbedColors.Green)
    .setTitle(`${emoji} ${title}`);

  if (description) {
    embed.setDescription(description);
  }

  const fields: APIEmbedField[] = [];

  // Balance change
  fields.push({
    name: "💰 Balance",
    value: `${change.display(change.before)} → ${change.display(change.after)}`,
    inline: true,
  });

  // Net change
  fields.push({
    name: "📈 Cambio",
    value: formatChange(change.delta, change.display),
    inline: true,
  });

  // Breakdown if provided
  if (breakdown) {
    fields.push({
      name: "📊 Desglose",
      value: buildBreakdownLines(breakdown),
      inline: false,
    });
  }

  // Extra fields
  fields.push(...extraFields);

  embed.setFields(fields);

  // Footer with optional correlation ID
  const footerParts: string[] = [];
  if (options.footerText) {
    footerParts.push(options.footerText);
  }
  if (options.showCorrelationId && options.correlationId) {
    footerParts.push(`ID: ${options.correlationId}`);
  }
  if (footerParts.length > 0) {
    embed.setFooter({ text: footerParts.join(" • ") });
  }

  if (options.timestamp) {
    embed.setTimestamp(options.timestamp);
  }

  return embed;
}

/**
 * Build an economy error embed with rich options.
 * (Extends the simpler buildErrorEmbed in formatting.ts)
 */
export function buildEconomyErrorEmbed(params: {
  title?: string;
  message: string;
  emoji?: string;
  suggestion?: string;
  options?: EmbedBuilderOptions;
}): Embed {
  const {
    title = "Error",
    message,
    emoji = "❌",
    suggestion,
    options = {},
  } = params;

  let description = message;
  if (suggestion) {
    description += `\n\n💡 *${suggestion}*`;
  }

  const embed = new Embed()
    .setColor(EmbedColors.Red)
    .setTitle(`${emoji} ${title}`)
    .setDescription(description);

  // Footer with optional correlation ID
  const footerParts: string[] = [];
  if (options.footerText) {
    footerParts.push(options.footerText);
  }
  if (options.showCorrelationId && options.correlationId) {
    footerParts.push(`ID: ${options.correlationId}`);
  }
  if (footerParts.length > 0) {
    embed.setFooter({ text: footerParts.join(" • ") });
  }

  return embed;
}

/**
 * Build an economy info/status embed.
 */
export function buildEconomyInfoEmbed(params: {
  title: string;
  description: string;
  emoji?: string;
  fields?: APIEmbedField[];
  options?: EmbedBuilderOptions;
}): Embed {
  const { title, description, emoji = "ℹ️", fields = [], options = {} } = params;

  const embed = new Embed()
    .setColor(EmbedColors.Blue)
    .setTitle(`${emoji} ${title}`)
    .setDescription(description)
    .setFields(fields);

  // Footer with optional correlation ID
  const footerParts: string[] = [];
  if (options.footerText) {
    footerParts.push(options.footerText);
  }
  if (options.showCorrelationId && options.correlationId) {
    footerParts.push(`ID: ${options.correlationId}`);
  }
  if (footerParts.length > 0) {
    embed.setFooter({ text: footerParts.join(" • ") });
  }

  return embed;
}

/**
 * Build an economy warning embed for partial successes or important notices.
 */
export function buildEconomyWarningEmbed(params: {
  title?: string;
  message: string;
  emoji?: string;
  fields?: APIEmbedField[];
  options?: EmbedBuilderOptions;
}): Embed {
  const {
    title = "Aviso",
    message,
    emoji = "⚠️",
    fields = [],
    options = {},
  } = params;

  const embed = new Embed()
    .setColor(EmbedColors.Yellow)
    .setTitle(`${emoji} ${title}`)
    .setDescription(message)
    .setFields(fields);

  // Footer with optional correlation ID
  const footerParts: string[] = [];
  if (options.footerText) {
    footerParts.push(options.footerText);
  }
  if (options.showCorrelationId && options.correlationId) {
    footerParts.push(`ID: ${options.correlationId}`);
  }
  if (footerParts.length > 0) {
    embed.setFooter({ text: footerParts.join(" • ") });
  }

  return embed;
}

// ============================================================================
// Specialized Result Embeds
// ============================================================================

/**
 * Build embed for daily claim result.
 */
export function buildDailyClaimEmbed(params: {
  amount: number;
  streak: number;
  bestStreak: number;
  streakBonus: number;
  fee: number;
  netAmount: number;
  currencyId: string;
  display: (n: number) => string;
  balanceBefore: number;
  balanceAfter: number;
  correlationId: string;
  levelUp?: boolean;
  newLevel?: number;
}): Embed {
  const {
    amount,
    streak,
    bestStreak,
    streakBonus,
    fee,
    netAmount,
    display,
    balanceBefore,
    balanceAfter,
    correlationId,
    levelUp,
    newLevel,
  } = params;

  const breakdown: TransactionBreakdown = {
    baseAmount: amount - streakBonus,
    bonus: streakBonus > 0 ? streakBonus : undefined,
    fee: fee > 0 ? fee : undefined,
    netAmount,
    currencyId: params.currencyId,
    display,
  };

  const extraFields: APIEmbedField[] = [];

  // Streak info
  extraFields.push({
    name: "🔥 Racha",
    value: `${formatNumber(streak)} días (mejor: ${formatNumber(bestStreak)})`,
    inline: true,
  });

  // Level up notification
  if (levelUp && newLevel) {
    extraFields.push({
      name: "🎉 ¡Subiste de nivel!",
      value: `Nivel ${formatNumber(newLevel)}`,
      inline: true,
    });
  }

  return buildResultEmbed({
    title: "Daily Claimed",
    emoji: "🎁",
    change: {
      before: balanceBefore,
      after: balanceAfter,
      delta: netAmount,
      currencyId: params.currencyId,
      display,
    },
    breakdown,
    extraFields,
    options: {
      correlationId,
      showCorrelationId: true,
    },
  });
}

/**
 * Build embed for work claim result.
 */
export function buildWorkClaimEmbed(params: {
  payout: number;
  baseMint: number;
  bonusFromWorks: number;
  bonusPct: number;
  currencyId: string;
  display: (n: number) => string;
  balanceBefore: number;
  balanceAfter: number;
  remainingToday: number;
  dailyCap: number;
  correlationId: string;
  levelUp?: boolean;
  newLevel?: number;
}): Embed {
  const {
    payout,
    baseMint,
    bonusFromWorks,
    bonusPct,
    display,
    balanceBefore,
    balanceAfter,
    remainingToday,
    dailyCap,
    correlationId,
    levelUp,
    newLevel,
  } = params;

  const extraFields: APIEmbedField[] = [];

  // Bonus info (Perks)
  if (bonusPct > 0) {
    extraFields.push({
      name: "💪 Bonus",
      value: `+${(bonusPct * 100).toFixed(0)}%`,
      inline: true,
    });
  }

  // Daily progress
  extraFields.push({
    name: "📅 Hoy",
    value: `${formatNumber(dailyCap - remainingToday)}/${formatNumber(dailyCap)}`,
    inline: true,
  });

  // Level up notification
  if (levelUp && newLevel) {
    extraFields.push({
      name: "🎉 ¡Subiste de nivel!",
      value: `Nivel ${formatNumber(newLevel)}`,
      inline: true,
    });
  }

  const breakdown: TransactionBreakdown = {
    baseAmount: baseMint,
    bonus: bonusFromWorks > 0 ? bonusFromWorks : undefined,
    netAmount: payout,
    currencyId: params.currencyId,
    display,
  };

  return buildResultEmbed({
    title: "Work Completed",
    emoji: "💼",
    change: {
      before: balanceBefore,
      after: balanceAfter,
      delta: payout,
      currencyId: params.currencyId,
      display,
    },
    breakdown,
    extraFields,
    options: {
      correlationId,
      showCorrelationId: true,
      footerText: `${formatNumber(remainingToday)} remaining today`,
    },
  });
}

/**
 * Build embed for coinflip result.
 */
export function buildCoinflipEmbed(params: {
  won: boolean;
  amount: number;
  choice: string;
  outcome: string;
  winnings: number;
  houseFee: number;
  netProfit: number;
  newBalance: number;
  display: (n: number) => string;
  correlationId: string;
}): Embed {
  const {
    won,
    amount,
    choice,
    outcome,
    winnings,
    houseFee,
    netProfit,
    newBalance,
    display,
    correlationId,
  } = params;

  const emoji = won ? "🎉" : "😢";
  const title = won ? "¡Ganaste!" : "Perdiste";
  const description = `Elegiste **${choice}**, salió **${outcome}**`;

  const extraFields: APIEmbedField[] = [];

  if (won) {
    const breakdown: TransactionBreakdown = {
      baseAmount: winnings,
      fee: houseFee > 0 ? houseFee : undefined,
      netAmount: netProfit,
      currencyId: "coin", // Will be overridden by display
      display,
    };

    extraFields.push({
      name: "💰 Ganancia bruta",
      value: display(winnings + houseFee),
      inline: true,
    });

    if (houseFee > 0) {
      extraFields.push({
        name: "🏦 Comisión",
        value: `-${display(houseFee)}`,
        inline: true,
      });
    }

    return buildResultEmbed({
      title,
      emoji,
      description,
      change: {
        before: newBalance - netProfit,
        after: newBalance,
        delta: netProfit,
        currencyId: "coin",
        display,
      },
      breakdown,
      options: {
        correlationId,
        showCorrelationId: true,
      },
    });
  } else {
    // Lost - show simpler embed
    return buildResultEmbed({
      title,
      emoji,
      description,
      change: {
        before: newBalance + amount,
        after: newBalance,
        delta: -amount,
        currencyId: "coin",
        display,
      },
      options: {
        correlationId,
        showCorrelationId: true,
      },
    });
  }
}

/**
 * Build embed for trivia result.
 */
export function buildTriviaEmbed(params: {
  correct: boolean;
  question: string;
  selectedAnswer: string;
  correctAnswer: string;
  currencyReward: number;
  xpReward: number;
  newBalance: number;
  display: (n: number) => string;
  correlationId: string;
}): Embed {
  const {
    correct,
    question,
    selectedAnswer,
    correctAnswer,
    currencyReward,
    xpReward,
    newBalance,
    display,
    correlationId,
  } = params;

  const emoji = correct ? "✅" : "❌";
  const title = correct ? "¡Correcto!" : "Incorrecto";

  const extraFields: APIEmbedField[] = [
    {
      name: "❓ Pregunta",
      value: question.length > 100 ? question.slice(0, 100) + "..." : question,
      inline: false,
    },
    {
      name: "Tu respuesta",
      value: selectedAnswer,
      inline: true,
    },
    {
      name: "Correcta",
      value: correctAnswer,
      inline: true,
    },
  ];

  if (correct) {
    extraFields.push({
      name: "⭐ XP",
      value: `+${formatNumber(xpReward)}`,
      inline: true,
    });

    return buildResultEmbed({
      title,
      emoji,
      change: {
        before: newBalance - currencyReward,
        after: newBalance,
        delta: currencyReward,
        currencyId: "coin",
        display,
      },
      extraFields,
      options: {
        correlationId,
        showCorrelationId: true,
      },
    });
  } else {
    return buildEconomyErrorEmbed({
      title: "Respuesta Incorrecta",
      message: `La respuesta correcta era: **${correctAnswer}**`,
      emoji: "❌",
      options: {
        correlationId,
        showCorrelationId: true,
      },
    });
  }
}

/**
 * Build embed for rob result.
 */
export function buildRobEmbed(params: {
  success: boolean;
  targetId: string;
  amountStolen: number;
  fineAmount: number;
  robberBalanceAfter: number;
  targetBalanceAfter: number;
  display: (n: number) => string;
  correlationId: string;
}): Embed {
  const {
    success,
    targetId,
    amountStolen,
    fineAmount,
    robberBalanceAfter,
    display,
    correlationId,
  } = params;

  if (success) {
    return buildResultEmbed({
      title: "¡Robo Exitoso!",
      emoji: "🦹",
      description: `Has robado a <@${targetId}>`,
      change: {
        before: robberBalanceAfter - amountStolen,
        after: robberBalanceAfter,
        delta: amountStolen,
        currencyId: "coin",
        display,
      },
      options: {
        correlationId,
        showCorrelationId: true,
      },
    });
  } else {
    const lostAmount = fineAmount || 0;
    return buildEconomyErrorEmbed({
      title: "¡Te Atraparon!",
      message: `Intentaste robar a <@${targetId}> pero fallaste.${lostAmount > 0 ? ` Multa: ${display(lostAmount)}` : ""}`,
      emoji: "🚔",
      options: {
        correlationId,
        showCorrelationId: true,
      },
    });
  }
}

/**
 * Build embed for vote result.
 */
export function buildVoteEmbed(params: {
  type: "love" | "hate";
  targetId: string;
  loveCount: number;
  hateCount: number;
  correlationId: string;
}): Embed {
  const { type, targetId, loveCount, hateCount, correlationId } = params;

  const emoji = type === "love" ? "💖" : "😤";
  const title = type === "love" ? "Love Enviado" : "Hate Enviado";
  const color = type === "love" ? EmbedColors.Green : EmbedColors.Red;

  const embed = new Embed()
    .setColor(color)
    .setTitle(`${emoji} ${title}`)
    .setDescription(`Has votado a <@${targetId}>`)
    .setFields([
      {
        name: "📊 Estadísticas",
        value: `💖 ${formatNumber(loveCount)}  •  😤 ${formatNumber(hateCount)}`,
        inline: false,
      },
    ])
    .setFooter({ text: `ID: ${correlationId}` });

  return embed;
}

/**
 * Build embed for crafting result.
 */
export function buildCraftEmbed(params: {
  recipeName: string;
  quantity: number;
  inputs: { itemName: string; quantity: number }[];
  outputs: { itemName: string; quantity: number }[];
  xpGained: number;
  display: (n: number) => string;
  correlationId: string;
}): Embed {
  const { recipeName, quantity, inputs, outputs, xpGained, correlationId } =
    params;

  const inputLines = inputs
    .map((i) => `• ${i.itemName} x${formatNumber(i.quantity)}`)
    .join("\n");
  const outputLines = outputs
    .map((o) => `• ${o.itemName} x${formatNumber(o.quantity)}`)
    .join("\n");

  return buildEconomyInfoEmbed({
    title: "Crafting Complete",
    emoji: "🔨",
    description: `Has crafteado **${recipeName}** x${formatNumber(quantity)}`,
    fields: [
      {
        name: "📥 Materiales",
        value: inputLines || "Ninguno",
        inline: true,
      },
      {
        name: "📤 Resultado",
        value: outputLines || "Ninguno",
        inline: true,
      },
      {
        name: "⭐ XP",
        value: `+${formatNumber(xpGained)}`,
        inline: true,
      },
    ],
    options: {
      correlationId,
      showCorrelationId: true,
    },
  });
}

/**
 * Build embed for perk purchase.
 */
export function buildPerkPurchaseEmbed(params: {
  perkName: string;
  level: number;
  cost: number;
  display: (n: number) => string;
  balanceBefore: number;
  balanceAfter: number;
  correlationId: string;
}): Embed {
  const {
    perkName,
    level,
    cost,
    display,
    balanceBefore,
    balanceAfter,
    correlationId,
  } = params;

  return buildResultEmbed({
    title: "Perk Adquirido",
    emoji: "⭐",
    description: `**${perkName}** → Nivel ${formatNumber(level)}`,
    change: {
      before: balanceBefore,
      after: balanceAfter,
      delta: -cost,
      currencyId: "coin",
      display,
    },
    options: {
      correlationId,
      showCorrelationId: true,
    },
  });
}

/**
 * Build embed for equipment operation.
 */
export function buildEquipmentEmbed(params: {
  action: "equip" | "unequip";
  itemName: string;
  slot: string;
  stats?: { stat: string; value: string }[];
  correlationId: string;
}): Embed {
  const { action, itemName, slot, stats, correlationId } = params;

  const emoji = action === "equip" ? "🗡️" : "📦";
  const title = action === "equip" ? "Item Equipado" : "Item Desequipado";
  const color = action === "equip" ? EmbedColors.Green : EmbedColors.Blue;

  const fields: APIEmbedField[] = [
    {
      name: "Slot",
      value: slot,
      inline: true,
    },
  ];

  if (stats && stats.length > 0) {
    fields.push({
      name: "Stats",
      value: stats.map((s) => `• ${s.stat}: ${s.value}`).join("\n"),
      inline: false,
    });
  }

  const embed = new Embed()
    .setColor(color)
    .setTitle(`${emoji} ${title}`)
    .setDescription(`**${itemName}**`)
    .setFields(fields)
    .setFooter({ text: `ID: ${correlationId}` });

  return embed;
}

