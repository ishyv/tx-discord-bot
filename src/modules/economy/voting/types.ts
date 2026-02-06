/**
 * Social Voting System Types.
 *
 * Purpose: Define types for love/hate voting with safety constraints.
 */

import type { GuildId, UserId } from "@/db/types";

/** Vote type: love or hate. */
export type VoteType = "love" | "hate";

/** Configuration for voting system per guild. */
export interface VotingConfig {
  readonly enabled: boolean;
  /** Cooldown between votes in seconds. */
  readonly cooldownSeconds: number;
  /** Daily vote cap per user. */
  readonly dailyMaxVotes: number;
  /** Hours before can vote same target again. */
  readonly repeatCooldownHours: number;
  /** Whether users can opt-out of receiving votes. */
  readonly allowOptOut: boolean;
  /** Default opt-out state for new users. */
  readonly defaultOptOut: boolean;
  /** Whether to show vote counts in public profile. */
  readonly showInProfile: boolean;
  /** Whether to allow voting on bots. */
  readonly allowBotTargets: boolean;
}

/** A single vote record. */
export interface Vote {
  readonly id: string;
  readonly guildId: GuildId;
  readonly voterId: UserId;
  readonly targetId: UserId;
  readonly type: VoteType;
  readonly timestamp: Date;
  readonly correlationId: string;
}

/** Vote counts for a user. */
export interface VoteCounts {
  readonly loveCount: number;
  readonly hateCount: number;
  readonly netScore: number; // love - hate
}

/** User's voting statistics. */
export interface UserVotingStats extends VoteCounts {
  readonly userId: UserId;
  readonly guildId: GuildId;
  readonly lastVoteAt?: Date;
  readonly dailyVoteCount: number;
  readonly dailyResetAt: Date;
}

/** User's voting preferences. */
export interface UserVotingPrefs {
  readonly optOut: boolean;
  readonly showVotes: boolean;
  readonly updatedAt: Date;
}

/** Input for casting a vote. */
export interface CastVoteInput {
  readonly guildId: GuildId;
  readonly voterId: UserId;
  readonly targetId: UserId;
  readonly type: VoteType;
}

/** Result of casting a vote. */
export interface CastVoteResult {
  readonly success: boolean;
  readonly vote?: Vote;
  readonly previousVoteType?: VoteType; // If changed vote
  readonly targetStats: VoteCounts;
  readonly correlationId: string;
  readonly timestamp: Date;
}

/** Error codes for voting operations. */
export type VoteErrorCode =
  | "VOTING_DISABLED"
  | "SELF_VOTE"
  | "TARGET_BLOCKED"
  | "TARGET_BANNED"
  | "TARGET_OPTED_OUT"
  | "TARGET_IS_BOT"
  | "COOLDOWN_ACTIVE"
  | "REPEAT_COOLDOWN"
  | "DAILY_LIMIT_REACHED"
  | "SAME_VOTE_TYPE"
  | "CONFIG_NOT_FOUND"
  | "UPDATE_FAILED"
  | "FEATURE_DISABLED";

export class VoteError extends Error {
  constructor(
    public readonly code: VoteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VoteError";
  }
}

/** Query for vote history. */
export interface VoteHistoryQuery {
  readonly guildId: GuildId;
  readonly voterId?: UserId;
  readonly targetId?: UserId;
  readonly type?: VoteType;
  readonly limit?: number;
  readonly before?: Date;
}

/** Recent vote for display. */
export interface RecentVote {
  readonly voterId: UserId;
  readonly voterName?: string;
  readonly type: VoteType;
  readonly timestamp: Date;
}

/** Vote badge for profile display. */
export interface VoteBadge {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly description: string;
  readonly requirement: {
    readonly type: "love" | "hate" | "net" | "received";
    readonly threshold: number;
  };
}

/** Default voting badges. */
export const VOTE_BADGES: readonly VoteBadge[] = [
  {
    id: "loved_10",
    name: "Apreciado",
    emoji: "💝",
    description: "Recibiste 10 love votes",
    requirement: { type: "received", threshold: 10 },
  },
  {
    id: "loved_50",
    name: "Adorado",
    emoji: "💖",
    description: "Recibiste 50 love votes",
    requirement: { type: "received", threshold: 50 },
  },
  {
    id: "loved_100",
    name: "Legendario",
    emoji: "💗",
    description: "Recibiste 100 love votes",
    requirement: { type: "received", threshold: 100 },
  },
  {
    id: "lover_25",
    name: "Romantic",
    emoji: "💘",
    description: "Diste 25 love votes",
    requirement: { type: "love", threshold: 25 },
  },
  {
    id: "positive_net",
    name: "Positivo",
    emoji: "✨",
    description: "Score neto +10",
    requirement: { type: "net", threshold: 10 },
  },
  {
    id: "very_positive",
    name: "Influencer",
    emoji: "🌟",
    description: "Score neto +50",
    requirement: { type: "net", threshold: 50 },
  },
] as const;

/** Per-guild vote aggregates stored on user. */
export interface GuildVoteAggregates {
  readonly loveReceived: number;
  readonly hateReceived: number;
  readonly loveGiven: number;
  readonly hateGiven: number;
  readonly lastUpdated: Date;
}

