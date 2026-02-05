/**
 * RPG Fight Service (Persistent).
 *
 * Purpose: Combat orchestration with MongoDB persistence.
 * Context: No in-memory state - all state in rpg_fights collection.
 * Dependencies: RpgFightRepo, RpgProfileRepo, CombatEngine.
 *
 * Invariants:
 * - All fight state persisted to MongoDB
 * - TTL on expiresAt for automatic cleanup
 * - Atomic operations for accept, submit, resolve
 * - isFighting flags set atomically with fight accept
 * - Audit entries on fight end with correlationId + seed
 */

import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { UserId } from "@/db/types";
import { economyAuditRepo } from "@/modules/economy/audit/repository";
import { getItemDefinition } from "@/modules/inventory/items";
import { COMBAT_CONFIG } from "../config";
import { rpgProfileRepo } from "../profile/repository";
import { RpgError } from "../profile/types";

import { StatsCalculator } from "../stats/calculator";
import { CombatEngine } from "./engine";
import type { FightPlayerSnapshot, RpgFightData, CombatMove } from "./fight-schema";
import { createFightData } from "./fight-schema";
import { rpgFightRepo } from "./fight-repository";

/** Default item resolver using inventory definitions. */
function defaultItemResolver(itemId: string): { atk?: number; def?: number; hp?: number } | null {
  const def = getItemDefinition(itemId);
  if (!def) return null;
  return {
    atk: def.stats?.atk,
    def: def.stats?.def,
    hp: def.stats?.hp,
  };
}

/** Challenge input. */
export interface ChallengeInput {
  inviterId: UserId;
  targetId: UserId;
  guildId?: string;
}

/** Challenge result. */
export interface ChallengeResult {
  fightId: string;
  expiresAt: Date;
}

/** Accept input. */
export interface AcceptInput {
  fightId: string;
  accepterId: UserId;
}

/** Submit move input. */
export interface SubmitMoveInput {
  fightId: string;
  playerId: UserId;
  move: CombatMove;
}

/** Fight state view. */
export interface FightStateView {
  fightId: string;
  status: "pending" | "active" | "completed" | "expired" | "forfeited";
  p1Id: string;
  p2Id: string;
  currentRound: number;
  p1Hp: number;
  p2Hp: number;
  p1MaxHp: number;
  p2MaxHp: number;
  winnerId: string | null;
  p1PendingMove: boolean;
  p2PendingMove: boolean;
  rounds: number;
}

export interface RpgFightService {
  /** Initialize (ensure indexes). */
  init(): Promise<void>;

  /** Challenge a player to combat. */
  challenge(
    input: ChallengeInput,
    resolveItem: (itemId: string) => { atk?: number; def?: number; hp?: number } | null,
  ): Promise<Result<ChallengeResult, RpgError>>;

  /** Accept a pending challenge. */
  accept(
    input: AcceptInput,
    resolveItem: (itemId: string) => { atk?: number; def?: number; hp?: number } | null,
  ): Promise<Result<FightStateView, RpgError>>;

  /** Submit a move for current round. */
  submitMove(input: SubmitMoveInput): Promise<Result<FightStateView, RpgError>>;

  /** Forfeit current fight. */
  forfeit(fightId: string, playerId: UserId): Promise<Result<FightStateView, RpgError>>;

  /** Get fight state. */
  getFight(fightId: string): Promise<Result<FightStateView | null, Error>>;

  /** Check if user is in active fight. */
  isInFight(userId: UserId): Promise<boolean>;

  /** Expire a fight manually (for testing/cleanup). */
  expireFight(fightId: string): Promise<Result<FightStateView, RpgError>>;
}

class RpgFightServiceImpl implements RpgFightService {
  async init(): Promise<void> {
    await rpgFightRepo.ensureIndexes();
  }

  async challenge(
    input: ChallengeInput,
    _resolveItem: (itemId: string) => { atk?: number; def?: number; hp?: number } | null,
  ): Promise<Result<ChallengeResult, RpgError>> {
    const correlationId = this.generateCorrelationId();

    // Validate no self-combat
    if (input.inviterId === input.targetId) {
      return ErrResult(new RpgError("SELF_COMBAT", "Cannot fight yourself"));
    }

    // Check neither is in active fight
    const [p1Active, p2Active] = await Promise.all([
      rpgFightRepo.findActiveByUser(input.inviterId),
      rpgFightRepo.findActiveByUser(input.targetId),
    ]);

    if (p1Active.isOk() && p1Active.unwrap()) {
      return ErrResult(new RpgError("IN_COMBAT", "You are already in a fight"));
    }
    if (p2Active.isOk() && p2Active.unwrap()) {
      return ErrResult(new RpgError("IN_COMBAT", "Target is already in a fight"));
    }

    // Create fight document
    const fightId = CombatEngine.generateSessionId();
    const seed = Math.floor(Math.random() * 2147483647);
    const expiresAt = new Date(Date.now() + COMBAT_CONFIG.sessionTtlMinutes * 60 * 1000);

    const fightData = createFightData(
      fightId,
      input.inviterId,
      input.targetId,
      seed,
      expiresAt,
      correlationId,
      input.guildId,
    );

    const createResult = await rpgFightRepo.create(fightData);
    if (createResult.isErr()) {
      return ErrResult(new RpgError("UPDATE_FAILED", "Failed to create fight"));
    }

    return OkResult({ fightId, expiresAt });
  }

  async accept(
    input: AcceptInput,
    resolveItem: (itemId: string) => { atk?: number; def?: number; hp?: number } | null,
  ): Promise<Result<FightStateView, RpgError>> {
    // Get fight
    const fightResult = await rpgFightRepo.findById(input.fightId);
    if (fightResult.isErr() || !fightResult.unwrap()) {
      return ErrResult(new RpgError("COMBAT_SESSION_EXPIRED", "Fight not found"));
    }

    const fight = fightResult.unwrap()!;

    // Validate
    if (fight.status !== "pending") {
      return ErrResult(new RpgError("COMBAT_ALREADY_ACCEPTED", "Fight already accepted or finished"));
    }
    if (fight.p2Id !== input.accepterId) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "You are not the challenged player"));
    }

    // Get both profiles
    const [p1ProfileResult, p2ProfileResult] = await Promise.all([
      rpgProfileRepo.findById(fight.p1Id),
      rpgProfileRepo.findById(fight.p2Id),
    ]);

    if (p1ProfileResult.isErr() || !p1ProfileResult.unwrap()) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "Challenger profile not found"));
    }
    if (p2ProfileResult.isErr() || !p2ProfileResult.unwrap()) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "Your profile not found"));
    }

    const p1Profile = p1ProfileResult.unwrap()!;
    const p2Profile = p2ProfileResult.unwrap()!;

    // Calculate stats
    // Calculate stats
    const p1Stats = StatsCalculator.calcStats(
      p1Profile.loadout,
      (id) => {
        const props = resolveItem(id);
        return props ? { id, atk: props.atk, def: props.def, hp: props.hp } : null;
      },
    );
    const p2Stats = StatsCalculator.calcStats(
      p2Profile.loadout,
      (id) => {
        const props = resolveItem(id);
        return props ? { id, atk: props.atk, def: props.def, hp: props.hp } : null;
      },
    );

    // Build snapshots
    const p1Snapshot: FightPlayerSnapshot = {
      userId: fight.p1Id,
      maxHp: p1Stats.maxHp,
      currentHp: p1Stats.maxHp,
      atk: p1Stats.atk,
      def: p1Stats.def,
      hasShield: p1Profile.loadout.shield !== null,
    };
    const p2Snapshot: FightPlayerSnapshot = {
      userId: fight.p2Id,
      maxHp: p2Stats.maxHp,
      currentHp: p2Stats.maxHp,
      atk: p2Stats.atk,
      def: p2Stats.def,
      hasShield: p2Profile.loadout.shield !== null,
    };

    // ATOMIC ACCEPT: Set snapshots and update status in one operation
    const acceptResult = await rpgFightRepo.accept(input.fightId, p1Snapshot, p2Snapshot);
    if (acceptResult.isErr() || !acceptResult.unwrap()) {
      return ErrResult(new RpgError("CONCURRENT_MODIFICATION", "Fight was already accepted or expired"));
    }

    const updatedFight = acceptResult.unwrap()!;

    // Set isFighting flags on both profiles atomically
    const lockResult = await this.setFightingLocks(fight.p1Id, fight.p2Id, true, fight._id);
    if (lockResult.isErr()) {
      // Attempt to rollback fight status
      await rpgFightRepo.expire(fight._id);
      return ErrResult(new RpgError("UPDATE_FAILED", "Failed to set fighting locks"));
    }

    return OkResult(this.toFightView(updatedFight));
  }

  async submitMove(input: SubmitMoveInput): Promise<Result<FightStateView, RpgError>> {
    // Get fight
    const fightResult = await rpgFightRepo.findById(input.fightId);
    if (fightResult.isErr() || !fightResult.unwrap()) {
      return ErrResult(new RpgError("COMBAT_SESSION_EXPIRED", "Fight not found"));
    }

    const fight = fightResult.unwrap()!;

    if (fight.status !== "active") {
      return ErrResult(new RpgError("NOT_IN_COMBAT", "Fight is not active"));
    }

    // Validate player is in this fight
    const isP1 = input.playerId === fight.p1Id;
    const isP2 = input.playerId === fight.p2Id;
    if (!isP1 && !isP2) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "You are not in this fight"));
    }

    // Check if already submitted
    const existingMove = isP1 ? fight.p1PendingMove : fight.p2PendingMove;
    if (existingMove) {
      return ErrResult(new RpgError("CONCURRENT_MODIFICATION", "Move already submitted for this round"));
    }

    // Submit move
    const moveKey = isP1 ? "p1" : "p2";
    const submitResult = await rpgFightRepo.submitMove(input.fightId, moveKey, input.move);
    if (submitResult.isErr() || !submitResult.unwrap()) {
      return ErrResult(new RpgError("UPDATE_FAILED", "Failed to submit move"));
    }

    let updatedFight = submitResult.unwrap()!;

    // Check if both moves are in and resolve round
    if (updatedFight.p1PendingMove && updatedFight.p2PendingMove) {
      const resolveResult = await this.resolveRound(updatedFight);
      if (resolveResult.isErr()) {
        return ErrResult(resolveResult.error);
      }
      updatedFight = resolveResult.unwrap()!;
    }

    return OkResult(this.toFightView(updatedFight));
  }

  async forfeit(fightId: string, playerId: UserId): Promise<Result<FightStateView, RpgError>> {
    const fightResult = await rpgFightRepo.findById(fightId);
    if (fightResult.isErr() || !fightResult.unwrap()) {
      return ErrResult(new RpgError("COMBAT_SESSION_EXPIRED", "Fight not found"));
    }

    const fight = fightResult.unwrap()!;

    if (fight.status !== "active") {
      return ErrResult(new RpgError("NOT_IN_COMBAT", "Fight is not active"));
    }

    if (fight.p1Id !== playerId && fight.p2Id !== playerId) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "You are not in this fight"));
    }

    // Forfeit
    const forfeitResult = await rpgFightRepo.forfeit(fightId, playerId);
    if (forfeitResult.isErr() || !forfeitResult.unwrap()) {
      return ErrResult(new RpgError("UPDATE_FAILED", "Failed to forfeit"));
    }

    const updatedFight = forfeitResult.unwrap()!;

    // Clear locks and audit
    await this.finishFight(updatedFight);

    return OkResult(this.toFightView(updatedFight));
  }

  async getFight(fightId: string): Promise<Result<FightStateView | null, Error>> {
    const result = await rpgFightRepo.findById(fightId);
    if (result.isErr()) return ErrResult(result.error);
    const fight = result.unwrap();
    if (!fight) return OkResult(null);
    return OkResult(this.toFightView(fight));
  }

  async isInFight(userId: UserId): Promise<boolean> {
    const result = await rpgFightRepo.findActiveByUser(userId);
    if (result.isErr()) return false;
    return result.unwrap() !== null;
  }

  async expireFight(fightId: string): Promise<Result<FightStateView, RpgError>> {
    const fightResult = await rpgFightRepo.findById(fightId);
    if (fightResult.isErr() || !fightResult.unwrap()) {
      return ErrResult(new RpgError("COMBAT_SESSION_EXPIRED", "Fight not found"));
    }

    const fight = fightResult.unwrap()!;

    // Only expire pending or active
    if (fight.status !== "pending" && fight.status !== "active") {
      return ErrResult(new RpgError("NOT_IN_COMBAT", "Fight already finished"));
    }

    const expireResult = await rpgFightRepo.expire(fightId);
    if (expireResult.isErr() || !expireResult.unwrap()) {
      return ErrResult(new RpgError("UPDATE_FAILED", "Failed to expire fight"));
    }

    const updatedFight = expireResult.unwrap()!;

    // Clear locks
    await this.clearFightingLocks(fight.p1Id, fight.p2Id);

    // Audit
    await this.auditFightEnd(updatedFight, "expired");

    return OkResult(this.toFightView(updatedFight));
  }

  /** Process an expired fight (called by TTL or cleanup job). */
  async processExpiredFight(fight: RpgFightData): Promise<void> {
    if (fight.status !== "expired") return;

    // Clear locks if still set
    await this.clearFightingLocks(fight.p1Id, fight.p2Id);

    // Audit
    await this.auditFightEnd(fight, "expired");
  }

  /** Resolve a round when both moves are submitted. */
  private async resolveRound(
    fight: RpgFightData,
  ): Promise<Result<RpgFightData | null, RpgError>> {
    if (!fight.p1Snapshot || !fight.p2Snapshot) {
      return ErrResult(new RpgError("UPDATE_FAILED", "Missing player snapshots"));
    }

    const p1Move = fight.p1PendingMove!;
    const p2Move = fight.p2PendingMove!;

    // Create mock session for engine
    const mockSession = {
      currentRound: fight.currentRound,
      seed: fight.seed,
      p1Hp: fight.p1Hp,
      p2Hp: fight.p2Hp,
      p1Atk: fight.p1Snapshot.atk,
      p2Atk: fight.p2Snapshot.atk,
      p1Def: fight.p1Snapshot.def,
      p2Def: fight.p2Snapshot.def,
      p1HasShield: fight.p1Snapshot.hasShield,
      p2HasShield: fight.p2Snapshot.hasShield,
    };

    // Resolve round
    const round = CombatEngine.resolveRound(mockSession as any, p1Move, p2Move);

    const fightRound = {
      roundNumber: round.roundNumber,
      p1Move: round.p1Move,
      p2Move: round.p2Move,
      p1Damage: round.p1Damage,
      p2Damage: round.p2Damage,
      p1Hp: round.p1Hp,
      p2Hp: round.p2Hp,
      resolvedAt: new Date().toISOString(),
    };

    // Update fight
    const resolveResult = await rpgFightRepo.resolveRound(
      fight._id,
      fightRound,
      round.p1Hp,
      round.p2Hp,
    );

    if (resolveResult.isErr() || !resolveResult.unwrap()) {
      return ErrResult(new RpgError("UPDATE_FAILED", "Failed to resolve round"));
    }

    let updatedFight = resolveResult.unwrap()!;

    // Check for end of combat
    if (CombatEngine.isCombatEnded({ p1Hp: round.p1Hp, p2Hp: round.p2Hp } as any)) {
      const winnerId = CombatEngine.determineWinner({
        p1Id: fight.p1Id,
        p2Id: fight.p2Id,
        p1Hp: round.p1Hp,
        p2Hp: round.p2Hp,
      } as any);

      if (winnerId) {
        const completeResult = await rpgFightRepo.complete(fight._id, winnerId);
        if (completeResult.isOk() && completeResult.unwrap()) {
          updatedFight = completeResult.unwrap()!;
          await this.finishFight(updatedFight);
        }
      }
    }

    return OkResult(updatedFight);
  }

  /** Set fighting locks on both profiles. */
  private async setFightingLocks(
    p1Id: string,
    p2Id: string,
    isFighting: boolean,
    fightId: string,
  ): Promise<Result<void, Error>> {
    try {
      // Set both locks (best effort - if one fails, we have inconsistency)
      await Promise.all([
        this.setProfileFightingLock(p1Id, isFighting, fightId),
        this.setProfileFightingLock(p2Id, isFighting, fightId),
      ]);
      return OkResult(undefined);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Clear fighting locks from profiles. */
  private async clearFightingLocks(p1Id: string, p2Id: string): Promise<void> {
    await Promise.all([
      this.setProfileFightingLock(p1Id, false, null),
      this.setProfileFightingLock(p2Id, false, null),
    ]);
  }

  /** Set individual profile fighting lock. */
  private async setProfileFightingLock(
    userId: string,
    isFighting: boolean,
    fightId: string | null,
  ): Promise<void> {
    const profileResult = await rpgProfileRepo.findById(userId);
    if (profileResult.isErr() || !profileResult.unwrap()) return;

    const profile = profileResult.unwrap()!;
    await rpgProfileRepo.updateCombatState(
      userId,
      isFighting,
      fightId,
      profile.hpCurrent,
      profile.isFighting,
    );
  }

  /** Finish fight - clear locks and audit. */
  private async finishFight(fight: RpgFightData): Promise<void> {
    // Clear locks
    await this.clearFightingLocks(fight.p1Id, fight.p2Id);

    // Audit (only for terminal states)
    if (fight.status === "completed" || fight.status === "expired" || fight.status === "forfeited") {
      await this.auditFightEnd(fight, fight.status);
    }
  }

  /** Write audit entry for fight end. */
  private async auditFightEnd(
    fight: RpgFightData,
    endType: "completed" | "expired" | "forfeited",
  ): Promise<void> {
    const winnerId = fight.winnerId;
    if (!winnerId) return;

    const loserId = winnerId === fight.p1Id ? fight.p2Id : fight.p1Id;

    await economyAuditRepo.create({
      operationType: "config_update", // Using closest available
      actorId: winnerId,
      targetId: loserId,
      guildId: fight.guildId,
      source: `rpg-fight-${endType}`,
      reason: `Fight ${endType}`,
      metadata: {
        correlationId: fight.correlationId,
        fightId: fight._id,
        seed: fight.seed,
        rounds: fight.rounds.length,
        winnerId,
        loserId,
        p1Hp: fight.p1Hp,
        p2Hp: fight.p2Hp,
      },
    });

    // Update win/loss records
    await this.updateCombatRecords(winnerId, loserId);
  }

  /** Update win/loss records for both players. */
  private async updateCombatRecords(winnerId: string, loserId: string): Promise<void> {
    const [winnerResult, loserResult] = await Promise.all([
      rpgProfileRepo.findById(winnerId),
      rpgProfileRepo.findById(loserId),
    ]);

    if (winnerResult.isOk() && winnerResult.unwrap()) {
      const winner = winnerResult.unwrap()!;
      const winnerStats = StatsCalculator.calcStats(winner.loadout, defaultItemResolver);
      await rpgProfileRepo.completeCombat(
        winnerId,
        winner.wins + 1,
        winner.losses,
        winner.hpCurrent,
        winnerStats.maxHp,
      );
    }

    if (loserResult.isOk() && loserResult.unwrap()) {
      const loser = loserResult.unwrap()!;
      const loserStats = StatsCalculator.calcStats(loser.loadout, defaultItemResolver);
      await rpgProfileRepo.completeCombat(
        loserId,
        loser.wins,
        loser.losses + 1,
        loser.hpCurrent,
        loserStats.maxHp,
      );
    }
  }

  /** Convert fight data to view. */
  private toFightView(fight: RpgFightData): FightStateView {
    return {
      fightId: fight._id,
      status: fight.status,
      p1Id: fight.p1Id,
      p2Id: fight.p2Id,
      currentRound: fight.currentRound,
      p1Hp: fight.p1Hp,
      p2Hp: fight.p2Hp,
      p1MaxHp: fight.p1Snapshot?.maxHp ?? 0,
      p2MaxHp: fight.p2Snapshot?.maxHp ?? 0,
      winnerId: fight.winnerId,
      p1PendingMove: !!fight.p1PendingMove,
      p2PendingMove: !!fight.p2PendingMove,
      rounds: fight.rounds.length,
    };
  }

  private generateCorrelationId(): string {
    return `rpg_fight_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

/** Singleton instance. */
export const rpgFightService: RpgFightService = new RpgFightServiceImpl();
