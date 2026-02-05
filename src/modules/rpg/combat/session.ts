/**
 * Combat Session Manager.
 *
 * Purpose: In-memory management of active combat sessions.
 * Context: Stores pending and active fights with TTL cleanup.
 * Dependencies: CombatEngine for ID generation.
 *
 * Invariants:
 * - Sessions auto-expire after TTL.
 * - No user can have multiple active sessions.
 * - Sessions are in-memory only (reconstructed from profiles on restart).
 */

import type { UserId } from "@/db/types";
import { COMBAT_CONFIG } from "../config";
import type { CombatMove, RpgProfile } from "../types";
import type { ActiveCombatSession, CombatInviteInput } from "./types";
import { CombatEngine } from "./engine";

/** Session manager interface. */
export interface SessionManager {
  /** Create a new pending combat session. */
  createSession(
    input: CombatInviteInput,
    p1Profile: RpgProfile,
    p2Profile: RpgProfile,
    p1Stats: { atk: number; def: number; maxHp: number },
    p2Stats: { atk: number; def: number; maxHp: number },
  ): ActiveCombatSession;

  /** Get session by ID. */
  getSession(sessionId: string): ActiveCombatSession | undefined;

  /** Get active session for user. */
  getUserSession(userId: UserId): ActiveCombatSession | undefined;

  /** Accept a pending session. */
  acceptSession(
    sessionId: string,
    accepterId: UserId,
  ): ActiveCombatSession | null;

  /** Submit move for a player. */
  submitMove(
    sessionId: string,
    playerId: UserId,
    move: CombatMove,
  ): ActiveCombatSession | null;

  /** Complete a session. */
  completeSession(sessionId: string, winnerId: UserId): ActiveCombatSession | null;

  /** Expire a session. */
  expireSession(sessionId: string): ActiveCombatSession | null;

  /** Clean up expired sessions. */
  cleanupExpired(): string[];

  /** Check if user is in combat. */
  isInCombat(userId: UserId): boolean;
}

class SessionManagerImpl implements SessionManager {
  private sessions = new Map<string, ActiveCombatSession>();
  private userSessions = new Map<UserId, string>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60000); // Clean up every minute
  }

  createSession(
    input: CombatInviteInput,
    p1Profile: RpgProfile,
    p2Profile: RpgProfile,
    p1Stats: { atk: number; def: number; maxHp: number },
    p2Stats: { atk: number; def: number; maxHp: number },
  ): ActiveCombatSession {
    const now = new Date();
    const ttlMs = COMBAT_CONFIG.sessionTtlMinutes * 60 * 1000;

    const session: ActiveCombatSession = {
      id: CombatEngine.generateSessionId(),
      p1Id: input.inviterId,
      p2Id: input.targetId,
      p1Hp: p1Stats.maxHp,
      p2Hp: p2Stats.maxHp,
      p1MaxHp: p1Stats.maxHp,
      p2MaxHp: p2Stats.maxHp,
      p1Atk: p1Stats.atk,
      p2Atk: p2Stats.atk,
      p1Def: p1Stats.def,
      p2Def: p2Stats.def,
      p1HasShield: p1Profile.equipment.shield !== null,
      p2HasShield: p2Profile.equipment.shield !== null,
      startedAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
      currentRound: 1,
      rounds: [],
      seed: Math.floor(Math.random() * 2147483647),
      status: "pending",
      winnerId: null,
      pendingMoves: new Map(),
    };

    this.sessions.set(session.id, session);
    this.userSessions.set(input.inviterId, session.id);
    this.userSessions.set(input.targetId, session.id);

    return session;
  }

  getSession(sessionId: string): ActiveCombatSession | undefined {
    return this.sessions.get(sessionId);
  }

  getUserSession(userId: UserId): ActiveCombatSession | undefined {
    const sessionId = this.userSessions.get(userId);
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId);
  }

  acceptSession(sessionId: string, accepterId: UserId): ActiveCombatSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.status !== "pending") return null;
    if (session.p2Id !== accepterId) return null;

    session.status = "active";
    return session;
  }

  submitMove(sessionId: string, playerId: UserId, move: CombatMove): ActiveCombatSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.status !== "active") return null;
    if (session.p1Id !== playerId && session.p2Id !== playerId) return null;

    // Store the move
    session.pendingMoves.set(playerId, move);

    // Check if both players have submitted moves
    if (session.pendingMoves.size === 2) {
      const p1Move = session.pendingMoves.get(session.p1Id) ?? "attack";
      const p2Move = session.pendingMoves.get(session.p2Id) ?? "attack";

      // Resolve the round
      const round = CombatEngine.resolveRound(session, p1Move, p2Move);
      session.rounds.push(round);

      // Update HP
      session.p1Hp = round.p1Hp;
      session.p2Hp = round.p2Hp;

      // Clear pending moves
      session.pendingMoves.clear();

      // Increment round counter
      session.currentRound++;

      // Check if combat ended
      if (CombatEngine.isCombatEnded(session)) {
        const winnerId = CombatEngine.determineWinner(session);
        if (winnerId) {
          session.winnerId = winnerId;
          session.status = "completed";
        }
      }
    }

    return session;
  }

  completeSession(sessionId: string, winnerId: UserId): ActiveCombatSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.winnerId = winnerId;
    session.status = "completed";

    return session;
  }

  expireSession(sessionId: string): ActiveCombatSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.status = "expired";
    return session;
  }

  cleanupExpired(): string[] {
    const now = new Date();
    const expired: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt <= now && session.status !== "completed") {
        this.expireSession(sessionId);
        expired.push(sessionId);

        // Clean up user mappings
        this.userSessions.delete(session.p1Id);
        this.userSessions.delete(session.p2Id);
      }
    }

    return expired;
  }

  isInCombat(userId: UserId): boolean {
    const session = this.getUserSession(userId);
    if (!session) return false;
    return session.status === "active" || session.status === "pending";
  }

  /** Clean up resources (for testing). */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.sessions.clear();
    this.userSessions.clear();
  }
}

/** Singleton instance. */
export const sessionManager: SessionManager = new SessionManagerImpl();
