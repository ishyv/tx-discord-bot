/**
 * Combat Log Formatter.
 *
 * Purpose: Format combat rounds into readable log entries.
 * Context: Discord embeds and chat messages.
 */

import type { CombatRound, CombatMove } from "../types";

/** Format a single move for display. */
export function formatMove(move: CombatMove): string {
  switch (move) {
    case "attack":
      return "⚔️ Attack";
    case "block":
      return "🛡️ Block";
    case "crit":
      return "💥 Critical Hit";
    case "failed_block":
      return "❌ Failed Block";
    default:
      return "❓ Unknown";
  }
}

/** Format a single round. */
export function formatRound(round: CombatRound, p1Name: string, p2Name: string): string {
  const lines: string[] = [];

  lines.push(`**Round ${round.roundNumber}**`);
  lines.push(`${p1Name}: ${formatMove(round.p1Move)}`);
  lines.push(`${p2Name}: ${formatMove(round.p2Move)}`);

  // Damage dealt
  if (round.p2Damage > 0) {
    lines.push(`↳ ${p1Name} deals **${round.p2Damage}** damage to ${p2Name}`);
  } else if (round.p1Move === "block") {
    lines.push(`↳ ${p1Name} blocks!`);
  }

  if (round.p1Damage > 0) {
    lines.push(`↳ ${p2Name} deals **${round.p1Damage}** damage to ${p1Name}`);
  } else if (round.p2Move === "block") {
    lines.push(`↳ ${p2Name} blocks!`);
  }

  // HP status
  lines.push(`HP: ${p1Name} **${round.p1Hp}** | ${p2Name} **${round.p2Hp}**`);

  return lines.join("\n");
}

/** Format entire combat log. */
export function formatCombatLog(
  rounds: CombatRound[],
  p1Name: string,
  p2Name: string,
  maxRounds: number = 10,
): string {
  if (rounds.length === 0) {
    return "*Combat has not started yet.*";
  }

  const lines: string[] = [];

  // Show last N rounds if too many
  const startIndex = Math.max(0, rounds.length - maxRounds);
  if (startIndex > 0) {
    lines.push(`*... ${startIndex} earlier rounds omitted ...*\n`);
  }

  for (let i = startIndex; i < rounds.length; i++) {
    const round = rounds[i]!;
    lines.push(formatRound(round, p1Name, p2Name));
    if (i < rounds.length - 1) {
      lines.push(""); // Empty line between rounds
    }
  }

  return lines.join("\n");
}

/** Format summary of combat result. */
export function formatCombatSummary(
  p1Name: string,
  p2Name: string,
  winnerId: string,
  p1Id: string,
  p1Hp: number,
  p2Hp: number,
  totalRounds: number,
): string {
  const winner = winnerId === p1Id ? p1Name : p2Name;
  const loser = winnerId === p1Id ? p2Name : p1Name;
  const loserHp = winnerId === p1Id ? p2Hp : p1Hp;

  return [
    `🏆 **${winner}** defeats ${loser}!`,
    `💀 ${loser} was left with ${loserHp} HP`,
    `⏱️ Combat lasted ${totalRounds} rounds`,
  ].join("\n");
}

/** Combat Log Formatter namespace. */
export const CombatLogFormatter = {
  formatMove,
  formatRound,
  formatCombatLog,
  formatCombatSummary,
} as const;
