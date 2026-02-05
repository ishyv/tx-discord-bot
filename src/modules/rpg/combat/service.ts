/**
 * RPG Combat Service.
 *
 * Purpose: Orchestrate combat flow with invite/accept/resolve.
 * Context: High-level combat API, integrates with profile and audit.
 * Dependencies: SessionManager, CombatEngine, RpgProfileRepo, StatsCalculator.
 *
 * Invariants:
 * - Both participants must have RPG profiles.
 * - Neither can be in combat already.
 * - Target must accept invitation.
 * - All state changes audited.
 */

import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { UserId } from "@/db/types";
import { economyAuditRepo } from "@/modules/economy/audit/repository";
import { rpgProfileRepo } from "../profile/repository";
import { RpgError } from "../profile/types";
import type { CombatResult } from "../types";
import type { CombatMove } from "../types";
import { StatsCalculator } from "../stats/calculator";
import { CombatEngine } from "./engine";
import { sessionManager } from "./session";
import type {
  CombatInviteInput,
  CombatAcceptInput,
  SubmitMoveInput,
  CombatActionResult,
} from "./types";

export interface RpgCombatService {
  /** Invite a player to combat. */
  invite(
    input: CombatInviteInput,
    resolveItem: (itemId: string) => { atk?: number; def?: number; hp?: number } | null,
  ): Promise<Result<CombatActionResult, RpgError>>;

  /** Accept a combat invitation. */
  accept(input: CombatAcceptInput): Promise<Result<CombatActionResult, RpgError>>;

  /** Submit a move for current round. */
  submitMove(input: SubmitMoveInput): Promise<Result<CombatActionResult, RpgError>>;

  /** Forfeit a combat. */
  forfeit(sessionId: string, playerId: UserId): Promise<Result<CombatResult, RpgError>>;

  /** Get session status. */
  getSession(sessionId: string): CombatActionResult;
}

class RpgCombatServiceImpl implements RpgCombatService {
  async invite(
    input: CombatInviteInput,
    resolveItem: (itemId: string) => { atk?: number; def?: number; hp?: number } | null,
  ): Promise<Result<CombatActionResult, RpgError>> {
    const correlationId = this.generateCorrelationId();

    // Step 1: Validate not self-combat
    if (input.inviterId === input.targetId) {
      return ErrResult(new RpgError("SELF_COMBAT", "Cannot fight yourself"));
    }

    // Step 2: Ensure both profiles exist
    const [p1Result, p2Result] = await Promise.all([
      rpgProfileRepo.ensure(input.inviterId),
      rpgProfileRepo.ensure(input.targetId),
    ]);

    if (p1Result.isErr()) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "Inviter profile not found"));
    }
    if (p2Result.isErr()) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "Target profile not found"));
    }

    const { profile: p1Profile } = p1Result.unwrap();
    const { profile: p2Profile } = p2Result.unwrap();

    // Step 3: Check neither is in combat
    if (p1Profile.isFighting) {
      return ErrResult(new RpgError("IN_COMBAT", "You are already in combat"));
    }
    if (p2Profile.isFighting) {
      return ErrResult(new RpgError("IN_COMBAT", "Target is already in combat"));
    }

    // Step 4: Check session manager
    if (sessionManager.isInCombat(input.inviterId)) {
      return ErrResult(new RpgError("IN_COMBAT", "You have an active combat session"));
    }
    if (sessionManager.isInCombat(input.targetId)) {
      return ErrResult(new RpgError("IN_COMBAT", "Target has an active combat session"));
    }

    // Step 5: Calculate stats
    // Step 5: Calculate stats
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

    // Step 6: Create session (cast to any for compatibility with old session manager)
    const session = sessionManager.createSession(
      input,
      p1Profile as any,
      p2Profile as any,
      p1Stats,
      p2Stats,
    );

    // Step 7: Set combat flags
    await this.setCombatFlag(input.inviterId, true, session.id);
    await this.setCombatFlag(input.targetId, true, session.id);

    // Step 8: Audit
    await economyAuditRepo.create({
      operationType: "config_update", // Using closest match
      actorId: input.inviterId,
      targetId: input.targetId,
      guildId: input.guildId,
      source: "rpg-combat-invite",
      metadata: {
        correlationId,
        sessionId: session.id,
      },
    });

    return OkResult({
      success: true,
      session: { ...session, pendingMoves: undefined as unknown as Map<string, CombatMove> },
    });
  }

  async accept(
    input: CombatAcceptInput,
  ): Promise<Result<CombatActionResult, RpgError>> {
    const session = sessionManager.acceptSession(input.sessionId, input.accepterId);
    if (!session) {
      return ErrResult(new RpgError("COMBAT_NOT_PENDING", "Combat not found or already accepted"));
    }

    return OkResult({
      success: true,
      session: { ...session, pendingMoves: undefined as unknown as Map<string, CombatMove> },
    });
  }

  async submitMove(
    input: SubmitMoveInput,
  ): Promise<Result<CombatActionResult, RpgError>> {
    const session = sessionManager.submitMove(input.sessionId, input.playerId, input.move);
    if (!session) {
      return ErrResult(new RpgError("COMBAT_SESSION_EXPIRED", "Combat session not found"));
    }

    // Check if combat ended
    if (session.status === "completed" && session.winnerId) {
      // Update profiles
      await this.completeCombat(session.id, session.winnerId);

      const combatResult = CombatEngine.buildCombatResult(session);

      return OkResult({
        success: true,
        session: { ...session, pendingMoves: undefined as unknown as Map<string, CombatMove> },
        combatResult,
      });
    }

    return OkResult({
      success: true,
      session: { ...session, pendingMoves: undefined as unknown as Map<string, CombatMove> },
    });
  }

  async forfeit(
    sessionId: string,
    playerId: UserId,
  ): Promise<Result<CombatResult, RpgError>> {
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return ErrResult(new RpgError("COMBAT_SESSION_EXPIRED", "Combat session not found"));
    }

    if (session.p1Id !== playerId && session.p2Id !== playerId) {
      return ErrResult(new RpgError("PROFILE_NOT_FOUND", "You are not in this combat"));
    }

    const winnerId = playerId === session.p1Id ? session.p2Id : session.p1Id;

    await this.completeCombat(sessionId, winnerId);

    const completed = sessionManager.completeSession(sessionId, winnerId);
    if (!completed) {
      return ErrResult(new RpgError("UPDATE_FAILED", "Failed to complete combat"));
    }

    const combatResult = CombatEngine.buildCombatResult(completed);

    // Audit
    await economyAuditRepo.create({
      operationType: "config_update",
      actorId: playerId,
      targetId: winnerId,
      source: "rpg-combat-forfeit",
      metadata: {
        sessionId,
        winnerId,
        forfeitBy: playerId,
      },
    });

    return OkResult(combatResult);
  }

  getSession(sessionId: string): CombatActionResult {
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return { success: false, error: "Combat session not found" };
    }

    return {
      success: true,
      session: { ...session, pendingMoves: undefined as unknown as Map<string, CombatMove> },
    };
  }

  private async setCombatFlag(
    userId: UserId,
    isFighting: boolean,
    sessionId: string | null,
  ): Promise<void> {
    const profileResult = await rpgProfileRepo.findById(userId);
    if (profileResult.isErr() || !profileResult.unwrap()) return;

    const profile = profileResult.unwrap()!;
    await rpgProfileRepo.updateCombatState(
      userId,
      isFighting,
      sessionId,
      profile.hpCurrent,
      profile.isFighting,
    );
  }

  private async completeCombat(sessionId: string, winnerId: UserId): Promise<void> {
    const session = sessionManager.getSession(sessionId);
    if (!session) return;

    const loserId = winnerId === session.p1Id ? session.p2Id : session.p1Id;

    // Update winner record
    const winnerResult = await rpgProfileRepo.findById(winnerId);
    if (winnerResult.isOk() && winnerResult.unwrap()) {
      const winner = winnerResult.unwrap()!;
      await rpgProfileRepo.completeCombat(
        winnerId,
        winner.wins + 1,
        winner.losses,
        winnerId === session.p1Id ? session.p1Hp : session.p2Hp,
      );
    }

    // Update loser record
    const loserResult = await rpgProfileRepo.findById(loserId);
    if (loserResult.isOk() && loserResult.unwrap()) {
      const loser = loserResult.unwrap()!;
      await rpgProfileRepo.completeCombat(
        loserId,
        loser.wins,
        loser.losses + 1,
        loserId === session.p1Id ? session.p1Hp : session.p2Hp,
      );
    }

    // Audit
    await economyAuditRepo.create({
      operationType: "config_update",
      actorId: winnerId,
      targetId: loserId,
      source: "rpg-combat-complete",
      metadata: {
        sessionId,
        winnerId,
        loserId,
      },
    });
  }

  private generateCorrelationId(): string {
    return `rpg_combat_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

/** Singleton instance. */
export const rpgCombatService: RpgCombatService = new RpgCombatServiceImpl();
