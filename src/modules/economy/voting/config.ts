/**
 * Voting System Configuration.
 *
 * Purpose: Default configs and badges.
 */

import type { VotingConfig, VoteBadge } from "./types";

/** Default voting configuration. */
export const DEFAULT_VOTING_CONFIG: VotingConfig = {
  enabled: true,
  cooldownSeconds: 60, // 1 minute between votes
  dailyMaxVotes: 20, // 20 votes per day
  repeatCooldownHours: 24, // Can vote same person once per day
  allowOptOut: true,
  defaultOptOut: false,
  showInProfile: true,
  allowBotTargets: false,
};

/** Check if user qualifies for a badge. */
export function checkBadgeEligibility(
  badge: VoteBadge,
  stats: {
    loveReceived: number;
    hateReceived: number;
    loveGiven: number;
    hateGiven: number;
  },
): boolean {
  switch (badge.requirement.type) {
    case "received":
      return stats.loveReceived >= badge.requirement.threshold;
    case "love":
      return stats.loveGiven >= badge.requirement.threshold;
    case "hate":
      return stats.hateGiven >= badge.requirement.threshold;
    case "net": {
      const netScore = stats.loveReceived - stats.hateReceived;
      return netScore >= badge.requirement.threshold;
    }
    default:
      return false;
  }
}

/** Get all eligible badges for a user. */
export function getEligibleBadges(
  badges: readonly VoteBadge[],
  stats: {
    loveReceived: number;
    hateReceived: number;
    loveGiven: number;
    hateGiven: number;
  },
): VoteBadge[] {
  return badges.filter((b) => checkBadgeEligibility(b, stats));
}

/** Format vote counts for display. */
export function formatVoteCounts(loveCount: number, hateCount: number): string {
  const net = loveCount - hateCount;
  const emoji = net > 0 ? "💖" : net < 0 ? "😤" : "⚖️";
  return `${emoji} ${loveCount} 💝 / ${hateCount} 😤 (Net: ${net > 0 ? "+" : ""}${net})`;
}

/** Calculate vote ratio as percentage. */
export function calculateLoveRatio(
  loveCount: number,
  hateCount: number,
): number {
  const total = loveCount + hateCount;
  if (total === 0) return 50; // Default 50% when no votes
  return Math.round((loveCount / total) * 100);
}
