/**
 * Voting Repository.
 *
 * Purpose: Manage votes, user stats, and configuration.
 */

import { GuildStore } from "@/db/repositories/guilds";
import { UserStore } from "@/db/repositories/users";
import type { GuildId, UserId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type {
  VotingConfig,
  Vote,
  UserVotingStats,
  UserVotingPrefs,
  VoteHistoryQuery,
  GuildVoteAggregates,
} from "./types";
import { DEFAULT_VOTING_CONFIG } from "./config";

export interface VotingRepo {
  // Configuration
  getConfig(guildId: GuildId): Promise<Result<VotingConfig, Error>>;
  updateConfig(
    guildId: GuildId,
    config: Partial<VotingConfig>,
  ): Promise<Result<VotingConfig, Error>>;

  // Voting
  castVote(vote: Omit<Vote, "id">): Promise<Result<Vote, Error>>;
  getLastVote(
    guildId: GuildId,
    voterId: UserId,
    targetId: UserId,
  ): Promise<Result<Vote | null, Error>>;
  getVoteHistory(query: VoteHistoryQuery): Promise<Result<Vote[], Error>>;

  // User stats and preferences
  getUserStats(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<UserVotingStats, Error>>;
  updateUserStats(
    guildId: GuildId,
    userId: UserId,
    updater: (stats: UserVotingStats) => UserVotingStats,
  ): Promise<Result<UserVotingStats, Error>>;
  getUserPrefs(userId: UserId): Promise<Result<UserVotingPrefs, Error>>;
  updateUserPrefs(
    userId: UserId,
    prefs: Partial<UserVotingPrefs>,
  ): Promise<Result<UserVotingPrefs, Error>>;

  // Aggregates
  getAggregates(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<GuildVoteAggregates, Error>>;
  incrementAggregates(
    guildId: GuildId,
    userId: UserId,
    type: "loveReceived" | "hateReceived" | "loveGiven" | "hateGiven",
  ): Promise<Result<GuildVoteAggregates, Error>>;

  // Daily reset check
  checkAndResetDailies(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<UserVotingStats, Error>>;
}

/** Build default user voting stats. */
const defaultUserStats = (
  guildId: GuildId,
  userId: UserId,
): UserVotingStats => ({
  userId,
  guildId,
  loveCount: 0,
  hateCount: 0,
  netScore: 0,
  dailyVoteCount: 0,
  dailyResetAt: new Date(),
});

/** Build default user preferences. */
const defaultUserPrefs = (): UserVotingPrefs => ({
  optOut: DEFAULT_VOTING_CONFIG.defaultOptOut,
  showVotes: true,
  updatedAt: new Date(),
});

/** Build default aggregates. */
const defaultAggregates = (): GuildVoteAggregates => ({
  loveReceived: 0,
  hateReceived: 0,
  loveGiven: 0,
  hateGiven: 0,
  lastUpdated: new Date(),
});

class VotingRepoImpl implements VotingRepo {
  async getConfig(guildId: GuildId): Promise<Result<VotingConfig, Error>> {
    const guildResult = await GuildStore.ensure(guildId);
    if (guildResult.isErr()) return ErrResult(guildResult.error);

    const guild = guildResult.unwrap();
    const stored = (guild.voting ?? {}) as Partial<VotingConfig>;

    return OkResult({ ...DEFAULT_VOTING_CONFIG, ...stored });
  }

  async updateConfig(
    guildId: GuildId,
    config: Partial<VotingConfig>,
  ): Promise<Result<VotingConfig, Error>> {
    try {
      const col = await GuildStore.collection();
      const now = new Date();

      const result = await col.findOneAndUpdate(
        { _id: guildId } as any,
        {
          $set: {
            voting: { ...config, updatedAt: now.toISOString() },
          },
        } as any,
        { returnDocument: "after" },
      );

      if (!result) {
        return ErrResult(new Error("Guild not found"));
      }

      const updated = (result as any).voting as
        | Partial<VotingConfig>
        | undefined;
      return OkResult({ ...DEFAULT_VOTING_CONFIG, ...updated });
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async castVote(vote: Omit<Vote, "id">): Promise<Result<Vote, Error>> {
    try {
      const col = (await GuildStore.collection()).db.collection("votes");
      const id = `vote_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const fullVote: Vote = {
        ...vote,
        id,
      };

      await col.insertOne(fullVote as any);
      return OkResult(fullVote);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async getLastVote(
    guildId: GuildId,
    voterId: UserId,
    targetId: UserId,
  ): Promise<Result<Vote | null, Error>> {
    try {
      const col = (await GuildStore.collection()).db.collection("votes");

      const vote = await col.findOne({ guildId, voterId, targetId } as any, {
        sort: { timestamp: -1 },
      });

      return OkResult(vote as Vote | null);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async getVoteHistory(
    query: VoteHistoryQuery,
  ): Promise<Result<Vote[], Error>> {
    try {
      const col = (await GuildStore.collection()).db.collection("votes");

      const filter: any = { guildId: query.guildId };
      if (query.voterId) filter.voterId = query.voterId;
      if (query.targetId) filter.targetId = query.targetId;
      if (query.type) filter.type = query.type;
      if (query.before) filter.timestamp = { $lt: query.before };

      const votes = await col
        .find(filter)
        .sort({ timestamp: -1 })
        .limit(query.limit ?? 50)
        .toArray();

      return OkResult(votes as unknown as Vote[]);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async getUserStats(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<UserVotingStats, Error>> {
    const userResult = await UserStore.get(userId);
    if (userResult.isErr()) return ErrResult(userResult.error);

    const user = userResult.unwrap();
    if (!user) {
      return OkResult(defaultUserStats(guildId, userId));
    }

    const votingData = (user.votingStats ?? {}) as Record<
      string,
      Partial<UserVotingStats>
    >;
    const guildStats = votingData[guildId] ?? {};

    const defaults = defaultUserStats(guildId, userId);
    return OkResult({
      ...defaults,
      ...guildStats,
      userId,
      guildId,
      netScore: (guildStats.loveCount ?? 0) - (guildStats.hateCount ?? 0),
    });
  }

  async updateUserStats(
    guildId: GuildId,
    userId: UserId,
    updater: (stats: UserVotingStats) => UserVotingStats,
  ): Promise<Result<UserVotingStats, Error>> {
    const currentResult = await this.getUserStats(guildId, userId);
    if (currentResult.isErr()) return ErrResult(currentResult.error);

    const newStats = updater(currentResult.unwrap());

    try {
      const col = await UserStore.collection();
      await col.updateOne(
        { _id: userId } as any,
        {
          $set: {
            [`votingStats.${guildId}`]: {
              loveCount: newStats.loveCount,
              hateCount: newStats.hateCount,
              lastVoteAt: newStats.lastVoteAt,
              dailyVoteCount: newStats.dailyVoteCount,
              dailyResetAt: newStats.dailyResetAt,
            },
          },
        } as any,
      );

      return OkResult(newStats);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async getUserPrefs(userId: UserId): Promise<Result<UserVotingPrefs, Error>> {
    const userResult = await UserStore.get(userId);
    if (userResult.isErr()) return ErrResult(userResult.error);

    const user = userResult.unwrap();
    const prefs = (user?.votingPrefs ?? {}) as Partial<UserVotingPrefs>;

    return OkResult({ ...defaultUserPrefs(), ...prefs });
  }

  async updateUserPrefs(
    userId: UserId,
    prefs: Partial<UserVotingPrefs>,
  ): Promise<Result<UserVotingPrefs, Error>> {
    try {
      const col = await UserStore.collection();
      const now = new Date();

      await col.updateOne(
        { _id: userId } as any,
        {
          $set: {
            votingPrefs: {
              ...prefs,
              updatedAt: now,
            },
          },
        } as any,
        { upsert: true },
      );

      return this.getUserPrefs(userId);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async getAggregates(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<GuildVoteAggregates, Error>> {
    const userResult = await UserStore.get(userId);
    if (userResult.isErr()) return ErrResult(userResult.error);

    const user = userResult.unwrap();
    if (!user) {
      return OkResult(defaultAggregates());
    }

    const aggregates = (user.voteAggregates ?? {}) as Record<
      string,
      Partial<GuildVoteAggregates>
    >;
    const guildAggregates = aggregates[guildId] ?? {};

    return OkResult({
      ...defaultAggregates(),
      ...guildAggregates,
    });
  }

  async incrementAggregates(
    guildId: GuildId,
    userId: UserId,
    type: "loveReceived" | "hateReceived" | "loveGiven" | "hateGiven",
  ): Promise<Result<GuildVoteAggregates, Error>> {
    try {
      const col = await UserStore.collection();
      const now = new Date();

      await col.updateOne(
        { _id: userId } as any,
        {
          $inc: { [`voteAggregates.${guildId}.${type}`]: 1 },
          $set: { [`voteAggregates.${guildId}.lastUpdated`]: now },
        } as any,
        { upsert: true },
      );

      return this.getAggregates(guildId, userId);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async checkAndResetDailies(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<UserVotingStats, Error>> {
    const statsResult = await this.getUserStats(guildId, userId);
    if (statsResult.isErr()) return ErrResult(statsResult.error);

    const stats = statsResult.unwrap();
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (new Date(stats.dailyResetAt) < dayStart) {
      // Reset daily count
      return this.updateUserStats(guildId, userId, (s) => ({
        ...s,
        dailyVoteCount: 0,
        dailyResetAt: now,
      }));
    }

    return OkResult(stats);
  }
}

export const votingRepo: VotingRepo = new VotingRepoImpl();
