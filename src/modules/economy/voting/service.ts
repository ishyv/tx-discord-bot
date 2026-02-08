/**
 * Voting Service.
 *
 * Purpose: Core voting logic with safety constraints and atomic updates.
 */

import type { GuildId, UserId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { economyAccountRepo } from "@/modules/economy/account/repository";
import { economyAuditRepo } from "@/modules/economy/audit/repository";
import type {
  CastVoteInput,
  CastVoteResult,
  UserVotingStats,
  UserVotingPrefs,
  VoteError,
  VoteBadge,
} from "./types";
import { VoteError as VoteErrorClass, VOTE_BADGES } from "./types";
import { votingRepo, type VotingRepo } from "./repository";
import { getEligibleBadges } from "./config";
import { guildEconomyRepo } from "@/modules/economy/guild/repository";

export class VotingService {
  constructor(private repo: VotingRepo) {}

  /** Check if cooldown has expired. */
  private isCooldownExpired(
    lastTime: Date | undefined,
    cooldownSeconds: number,
  ): boolean {
    if (!lastTime) return true;
    return Date.now() - new Date(lastTime).getTime() >= cooldownSeconds * 1000;
  }

  /** Check if repeat cooldown has expired. */
  private isRepeatCooldownExpired(
    lastVoteTime: Date | undefined,
    cooldownHours: number,
  ): boolean {
    if (!lastVoteTime) return true;
    return (
      Date.now() - new Date(lastVoteTime).getTime() >=
      cooldownHours * 60 * 60 * 1000
    );
  }

  async castVote(
    input: CastVoteInput,
  ): Promise<Result<CastVoteResult, VoteError>> {
    const { guildId, voterId, targetId, type } = input;

    // Safety: Prevent self-voting
    if (voterId === targetId) {
      return ErrResult(
        new VoteErrorClass("SELF_VOTE", "You cannot vote for yourself."),
      );
    }

    // Get config
    const configResult = await this.repo.getConfig(guildId);
    if (configResult.isErr()) {
      return ErrResult(
        new VoteErrorClass("CONFIG_NOT_FOUND", "Configuration not found."),
      );
    }
    const config = configResult.unwrap();

    if (!config.enabled) {
      return ErrResult(
        new VoteErrorClass(
          "VOTING_DISABLED",
          "Voting system is disabled.",
        ),
      );
    }

    // Check guild feature flag
    const guildConfigResult = await guildEconomyRepo.findByGuildId(guildId);
    if (guildConfigResult.isOk()) {
      const guildConfig = guildConfigResult.unwrap();
      if (guildConfig && !guildConfig.features.voting) {
        return ErrResult(
          new VoteErrorClass(
            "FEATURE_DISABLED",
            "Voting is disabled in this server.",
          ),
        );
      }
    }

    // Check voter account status
    const voterResult = await economyAccountRepo.ensure(voterId);
    if (voterResult.isErr()) {
      return ErrResult(
        new VoteErrorClass("UPDATE_FAILED", "Could not verify your account."),
      );
    }
    const { account: voterAccount } = voterResult.unwrap();
    if (voterAccount.status === "blocked") {
      return ErrResult(
        new VoteErrorClass("TARGET_BLOCKED", "Your account has restrictions."),
      );
    }
    if (voterAccount.status === "banned") {
      return ErrResult(
        new VoteErrorClass("TARGET_BANNED", "Your account is banned."),
      );
    }

    // Check target account status
    const targetResult = await economyAccountRepo.ensure(targetId);
    if (targetResult.isErr()) {
      return ErrResult(
        new VoteErrorClass("TARGET_BLOCKED", "Target does not exist."),
      );
    }
    const { account: targetAccount } = targetResult.unwrap();
    if (targetAccount.status === "blocked") {
      return ErrResult(
        new VoteErrorClass(
          "TARGET_BLOCKED",
          "The target account has restrictions.",
        ),
      );
    }
    if (targetAccount.status === "banned") {
      return ErrResult(
        new VoteErrorClass("TARGET_BANNED", "Target is banned."),
      );
    }

    // Safety: Check if target is a bot (if not allowed)
    if (!config.allowBotTargets) {
      // Note: In real implementation, we'd check if target is a bot
      // For now, we assume the command handler provides this info
    }

    // Safety: Check if target opted out
    if (config.allowOptOut) {
      const targetPrefs = await this.repo.getUserPrefs(targetId);
      if (targetPrefs.isOk() && targetPrefs.unwrap().optOut) {
        return ErrResult(
          new VoteErrorClass(
            "TARGET_OPTED_OUT",
            "This user does not accept votes.",
          ),
        );
      }
    }

    // Check and reset dailies for voter
    const voterStatsResult = await this.repo.checkAndResetDailies(
      guildId,
      voterId,
    );
    if (voterStatsResult.isErr()) {
      return ErrResult(
        new VoteErrorClass("UPDATE_FAILED", "Error checking limits."),
      );
    }
    const voterStats = voterStatsResult.unwrap();

    // Safety: Check daily limit
    if (voterStats.dailyVoteCount >= config.dailyMaxVotes) {
      return ErrResult(
        new VoteErrorClass(
          "DAILY_LIMIT_REACHED",
          `Daily vote limit of ${config.dailyMaxVotes} reached.`,
        ),
      );
    }

    // Safety: Check cooldown
    if (!this.isCooldownExpired(voterStats.lastVoteAt, config.cooldownSeconds)) {
      const remaining = Math.ceil(
        (new Date(voterStats.lastVoteAt!).getTime() +
          config.cooldownSeconds * 1000 -
          Date.now()) /
          1000,
      );
      return ErrResult(
        new VoteErrorClass(
          "COOLDOWN_ACTIVE",
          `Wait ${remaining}s before voting again.`,
        ),
      );
    }

    // Safety: Check repeat cooldown (can't vote same target within N hours)
    const lastVoteResult = await this.repo.getLastVote(
      guildId,
      voterId,
      targetId,
    );
    if (lastVoteResult.isOk() && lastVoteResult.unwrap()) {
      const lastVote = lastVoteResult.unwrap()!;

      // Check if trying to vote same type
      if (lastVote.type === type) {
        return ErrResult(
          new VoteErrorClass(
            "SAME_VOTE_TYPE",
            `You already voted ${type === "love" ? "💖" : "😤"} for this user. Change your vote first.`,
          ),
        );
      }

      // Check repeat cooldown
      if (
        !this.isRepeatCooldownExpired(lastVote.timestamp, config.repeatCooldownHours)
      ) {
        const remainingHours = Math.ceil(
          (new Date(lastVote.timestamp).getTime() +
            config.repeatCooldownHours * 60 * 60 * 1000 -
            Date.now()) /
            (1000 * 60 * 60),
        );
        return ErrResult(
          new VoteErrorClass(
            "REPEAT_COOLDOWN",
            `You must wait ${remainingHours}h before voting for this user again.`,
          ),
        );
      }
    }

    // All checks passed - cast the vote
    const correlationId = `vote_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();

    const voteResult = await this.repo.castVote({
      guildId,
      voterId,
      targetId,
      type,
      timestamp: now,
      correlationId,
    });

    if (voteResult.isErr()) {
      return ErrResult(
        new VoteErrorClass("UPDATE_FAILED", "Error registering the vote."),
      );
    }

    const vote = voteResult.unwrap();

    // Update voter stats
    await this.repo.updateUserStats(guildId, voterId, (s) => ({
      ...s,
      dailyVoteCount: s.dailyVoteCount + 1,
      lastVoteAt: now,
    }));

    // Update target vote counts
    await this.repo.updateUserStats(guildId, targetId, (s) => ({
      ...s,
      loveCount: type === "love" ? s.loveCount + 1 : s.loveCount,
      hateCount: type === "hate" ? s.hateCount + 1 : s.hateCount,
      netScore: type === "love" ? s.netScore + 1 : s.netScore - 1,
    }));

    // Update aggregates for badge tracking
    await this.repo.incrementAggregates(
      guildId,
      targetId,
      type === "love" ? "loveReceived" : "hateReceived",
    );
    await this.repo.incrementAggregates(
      guildId,
      voterId,
      type === "love" ? "loveGiven" : "hateGiven",
    );

    // Audit
    await economyAuditRepo.create({
      operationType: "currency_adjust", // Using existing type
      actorId: voterId,
      targetId,
      guildId,
      source: "voting",
      reason: `Vote ${type} on ${targetId}`,
      metadata: {
        correlationId,
        type: "vote_cast",
        voteType: type,
        previousVoteType: lastVoteResult.unwrap()?.type,
      },
    });

    // Get updated target stats
    const updatedTargetStats = await this.repo.getUserStats(guildId, targetId);

    return OkResult({
      success: true,
      vote,
      previousVoteType: lastVoteResult.unwrap()?.type,
      targetStats: {
        loveCount: updatedTargetStats.unwrap().loveCount,
        hateCount: updatedTargetStats.unwrap().hateCount,
        netScore: updatedTargetStats.unwrap().netScore,
      },
      correlationId,
      timestamp: now,
    });
  }

  async getUserStats(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<UserVotingStats, Error>> {
    return this.repo.getUserStats(guildId, userId);
  }

  async getUserPrefs(userId: UserId): Promise<Result<UserVotingPrefs, Error>> {
    return this.repo.getUserPrefs(userId);
  }

  async updateUserPrefs(
    userId: UserId,
    prefs: Partial<UserVotingPrefs>,
  ): Promise<Result<UserVotingPrefs, Error>> {
    return this.repo.updateUserPrefs(userId, prefs);
  }

  async toggleOptOut(userId: UserId): Promise<Result<boolean, Error>> {
    const prefsResult = await this.repo.getUserPrefs(userId);
    if (prefsResult.isErr()) return ErrResult(prefsResult.error);

    const current = prefsResult.unwrap();
    const newOptOut = !current.optOut;

    const updateResult = await this.repo.updateUserPrefs(userId, {
      optOut: newOptOut,
    });
    if (updateResult.isErr()) return ErrResult(updateResult.error);

    return OkResult(newOptOut);
  }

  async getUserBadges(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<VoteBadge[], Error>> {
    const aggregatesResult = await this.repo.getAggregates(guildId, userId);
    if (aggregatesResult.isErr()) return ErrResult(aggregatesResult.error);

    const agg = aggregatesResult.unwrap();
    const badges = getEligibleBadges(VOTE_BADGES, {
      loveReceived: agg.loveReceived,
      hateReceived: agg.hateReceived,
      loveGiven: agg.loveGiven,
      hateGiven: agg.hateGiven,
    });

    return OkResult(badges);
  }

  async getLeaderboard(
    guildId: GuildId,
    type: "love" | "hate" | "net",
    limit = 10,
  ): Promise<Result<{ userId: UserId; score: number }[], Error>> {
    try {
      const col = (await (await import("@/db/mongo")).getDb()).collection(
        "users",
      );

      const sortField =
        type === "love"
          ? `votingStats.${guildId}.loveCount`
          : type === "hate"
            ? `votingStats.${guildId}.hateCount`
            : `votingStats.${guildId}.netScore`;

      const users = await col
        .find({ [sortField]: { $exists: true } } as any)
        .sort({ [sortField]: -1 } as any)
        .limit(limit)
        .project({ _id: 1, [sortField]: 1 })
        .toArray();

      const leaderboard = users.map((u: any) => ({
        userId: u._id as string,
        score: (u[sortField] as number) ?? 0,
      }));

      return OkResult(leaderboard);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async canVote(
    guildId: GuildId,
    voterId: UserId,
    targetId: UserId,
  ): Promise<
    Result<
      { canVote: boolean; reason?: string; cooldownSeconds?: number },
      Error
    >
  > {
    // Self-check
    if (voterId === targetId) {
      return OkResult({
        canVote: false,
        reason: "You cannot vote for yourself.",
      });
    }

    // Get config
    const configResult = await this.repo.getConfig(guildId);
    if (configResult.isErr()) {
      return OkResult({
        canVote: false,
        reason: "Configuration unavailable.",
      });
    }
    const config = configResult.unwrap();

    if (!config.enabled) {
      return OkResult({
        canVote: false,
        reason: "Voting system disabled.",
      });
    }

    // Check voter status
    const voterResult = await economyAccountRepo.ensure(voterId);
    if (voterResult.isErr() || voterResult.unwrap().account.status !== "ok") {
      return OkResult({
        canVote: false,
        reason: "Your account has restrictions.",
      });
    }

    // Check target status
    const targetResult = await economyAccountRepo.ensure(targetId);
    if (targetResult.isErr() || targetResult.unwrap().account.status !== "ok") {
      return OkResult({
        canVote: false,
        reason: "The target cannot receive votes.",
      });
    }

    // Check opt-out
    if (config.allowOptOut) {
      const targetPrefs = await this.repo.getUserPrefs(targetId);
      if (targetPrefs.isOk() && targetPrefs.unwrap().optOut) {
        return OkResult({
          canVote: false,
          reason: "This user does not accept votes.",
        });
      }
    }

    // Check daily limit
    const statsResult = await this.repo.checkAndResetDailies(guildId, voterId);
    if (
      statsResult.isOk() &&
      statsResult.unwrap().dailyVoteCount >= config.dailyMaxVotes
    ) {
      return OkResult({ canVote: false, reason: "Daily limit reached." });
    }

    // Check cooldown
    const stats = statsResult.unwrap();
    if (stats.lastVoteAt) {
      const cooldownEnd =
        new Date(stats.lastVoteAt).getTime() + config.cooldownSeconds * 1000;
      if (Date.now() < cooldownEnd) {
        return OkResult({
          canVote: false,
          reason: "On cooldown.",
          cooldownSeconds: Math.ceil((cooldownEnd - Date.now()) / 1000),
        });
      }
    }

    return OkResult({ canVote: true });
  }

  async resetDailyLimits(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<void, Error>> {
    const result = await this.repo.updateUserStats(guildId, userId, (s) => ({
      ...s,
      dailyVoteCount: 0,
      dailyResetAt: new Date(),
    }));

    if (result.isErr()) return ErrResult(result.error);
    return OkResult(undefined);
  }
}

export const votingService = new VotingService(votingRepo);



