/**
 * RPG Views - Embeds.
 *
 * Purpose: Discord embed builders for RPG UI.
 * Context: Profile displays, combat views, etc.
 */

import type { RpgProfile, CombatSession, CombatResult } from "../types";
import type { CalculatedStats } from "../stats/types";
import { HpBarRenderer } from "./hp-bar";
import { CombatLogFormatter } from "./combat-log";

/** Equipment slot emojis. */
const SLOT_EMOJIS: Record<string, string> = {
  weapon: "⚔️",
  shield: "🛡️",
  helmet: "⛑️",
  chest: "👕",
  pants: "👖",
  boots: "👢",
  ring: "💍",
  necklace: "📿",
};

/** Format equipment slot display. */
function formatSlot(slot: string, itemId: string | null): string {
  const emoji = SLOT_EMOJIS[slot] ?? "📦";
  const itemName = itemId ?? "*Empty*";
  return `${emoji} **${capitalize(slot)}:** ${itemName}`;
}

/** Capitalize string. */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Create profile embed data. */
export function createProfileEmbed(
  profile: RpgProfile,
  stats: CalculatedStats,
  userDisplayName: string,
): {
  title: string;
  description: string;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  color: number;
} {
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  // Stats field
  fields.push({
    name: "📊 Stats",
    value: [
      `⚔️ **ATK:** ${stats.atk}`,
      `🛡️ **DEF:** ${stats.def}`,
      `❤️ **HP:** ${HpBarRenderer.compact(profile.combat.currentHp, stats.maxHp)}`,
    ].join("\n"),
    inline: true,
  });

  // Record field
  const totalFights = profile.record.wins + profile.record.losses;
  const winRate = totalFights > 0 ? Math.round((profile.record.wins / totalFights) * 100) : 0;
  fields.push({
    name: "🏆 Record",
    value: [
      `✅ Wins: ${profile.record.wins}`,
      `❌ Losses: ${profile.record.losses}`,
      `📈 Win Rate: ${winRate}%`,
    ].join("\n"),
    inline: true,
  });

  // Equipment fields
  const equipmentLines = Object.entries(profile.equipment).map(([slot, itemId]) =>
    formatSlot(slot, itemId),
  );

  fields.push({
    name: "🎒 Equipment",
    value: equipmentLines.join("\n") || "*No equipment*",
    inline: false,
  });

  // Combat status
  if (profile.combat.isFighting) {
    fields.push({
      name: "⚔️ Status",
      value: "🔴 **In Combat**",
      inline: false,
    });
  }

  return {
    title: `🎮 RPG Profile: ${userDisplayName}`,
    description: `Created: <t:${Math.floor(profile.createdAt.getTime() / 1000)}:R>`,
    fields,
    color: profile.combat.isFighting ? 0xff0000 : 0x00ff00,
  };
}

/** Create combat invite embed data. */
export function createCombatInviteEmbed(
  inviterName: string,
  targetName: string,
  expiresAt: Date,
): {
  title: string;
  description: string;
  color: number;
} {
  return {
    title: "⚔️ Combat Challenge",
    description: [
      `**${inviterName}** has challenged **${targetName}** to a duel!`,
      "",
      `⏰ Expires <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
    ].join("\n"),
    color: 0xffa500,
  };
}

/** Create combat status embed data. */
export function createCombatStatusEmbed(
  session: CombatSession,
  p1Name: string,
  p2Name: string,
  p1Hp: number,
  p2Hp: number,
  p1MaxHp: number,
  p2MaxHp: number,
): {
  title: string;
  description: string;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  color: number;
} {
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  fields.push({
    name: p1Name,
    value: HpBarRenderer.render({
      current: p1Hp,
      max: p1MaxHp,
      length: 10,
      showPercent: false,
    }),
    inline: true,
  });

  fields.push({
    name: p2Name,
    value: HpBarRenderer.render({
      current: p2Hp,
      max: p2MaxHp,
      length: 10,
      showPercent: false,
    }),
    inline: true,
  });

  // Combat log
  if (session.rounds.length > 0) {
    const logText = CombatLogFormatter.formatCombatLog(
      session.rounds,
      p1Name,
      p2Name,
      5, // Last 5 rounds
    );

    fields.push({
      name: "📜 Combat Log",
      value: logText.substring(0, 1024), // Discord field limit
      inline: false,
    });
  }

  return {
    title: `⚔️ Round ${session.currentRound}`,
    description: "Both fighters prepare their moves...",
    fields,
    color: 0x800080,
  };
}

/** Create combat result embed data. */
export function createCombatResultEmbed(
  result: CombatResult,
  p1Name: string,
  p2Name: string,
  p1Id: string,
): {
  title: string;
  description: string;
  color: number;
} {
  const summary = CombatLogFormatter.formatCombatSummary(
    p1Name,
    p2Name,
    result.winnerId,
    p1Id,
    result.finalHp.winner,
    result.finalHp.loser,
    result.totalRounds,
  );

  return {
    title: "🏆 Combat Ended",
    description: summary,
    color: 0xffd700,
  };
}

/** Create gathering result embed data. */
export function createGatheringEmbed(
  locationName: string,
  materialsGained: Array<{ id: string; quantity: number }>,
  toolBroken: boolean,
): {
  title: string;
  description: string;
  color: number;
} {
  const materialLines = materialsGained.map(
    (m) => `+${m.quantity} ${m.id.replace(/_/g, " ")}`,
  );

  let description = materialLines.join("\n");
  if (toolBroken) {
    description += "\n\n💔 **Your tool broke!**";
  }

  return {
    title: `⛏️ Gathering at ${locationName}`,
    description,
    color: toolBroken ? 0xff0000 : 0x00ff00,
  };
}

/** Create processing result embed data. */
export function createProcessingEmbed(
  rawMaterialId: string,
  outputMaterialId: string,
  batchesAttempted: number,
  batchesSucceeded: number,
  totalFee: number,
): {
  title: string;
  description: string;
  color: number;
} {
  const success = batchesSucceeded > 0;
  const outputGained = batchesSucceeded;

  return {
    title: success ? "✅ Processing Complete" : "❌ Processing Failed",
    description: [
      `Input: ${batchesAttempted * 2} ${rawMaterialId.replace(/_/g, " ")}`,
      `Output: ${outputGained} ${outputMaterialId.replace(/_/g, " ")}`,
      `Success: ${batchesSucceeded}/${batchesAttempted} batches`,
      `Fee: ${totalFee} coins`,
    ].join("\n"),
    color: success ? 0x00ff00 : 0xffa500,
  };
}

/** Create upgrade result embed data. */
export function createUpgradeEmbed(
  originalToolId: string,
  newToolId: string,
  newTier: number,
  moneySpent: number,
): {
  title: string;
  description: string;
  color: number;
} {
  return {
    title: "⬆️ Upgrade Complete!",
    description: [
      `**${originalToolId.replace(/_/g, " ")}** → **${newToolId.replace(/_/g, " ")}**`,
      `New Tier: ${newTier}`,
      `Cost: ${moneySpent} coins`,
    ].join("\n"),
    color: 0x00ff00,
  };
}

/** RPG Views namespace. */
export const RpgViews = {
  profile: createProfileEmbed,
  combatInvite: createCombatInviteEmbed,
  combatStatus: createCombatStatusEmbed,
  combatResult: createCombatResultEmbed,
  gathering: createGatheringEmbed,
  processing: createProcessingEmbed,
  upgrade: createUpgradeEmbed,
} as const;
