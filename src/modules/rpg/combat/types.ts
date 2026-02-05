/**
 * Combat Types.
 *
 * Purpose: Type definitions for combat system.
 * Context: Used by combat engine and session manager.
 */

import type { UserId } from "@/db/types";
import type { CombatMove, CombatRound, CombatResult } from "../types";

/** Combat session in memory (not persisted to DB). */
export interface ActiveCombatSession {
  /** Unique session ID. */
  id: string;
  /** Player 1 ID (inviter). */
  p1Id: UserId;
  /** Player 2 ID (target). */
  p2Id: UserId;
  /** Current HP for player 1. */
  p1Hp: number;
  /** Current HP for player 2. */
  p2Hp: number;
  /** Maximum HP for player 1. */
  p1MaxHp: number;
  /** Maximum HP for player 2. */
  p2MaxHp: number;
  /** ATK for player 1. */
  p1Atk: number;
  /** ATK for player 2. */
  p2Atk: number;
  /** DEF for player 1. */
  p1Def: number;
  /** DEF for player 2. */
  p2Def: number;
  /** Shield equipped by player 1. */
  p1HasShield: boolean;
  /** Shield equipped by player 2. */
  p2HasShield: boolean;
  /** Combat start time. */
  startedAt: Date;
  /** Session expiration time. */
  expiresAt: Date;
  /** Current round number. */
  currentRound: number;
  /** Combat rounds history. */
  rounds: CombatRound[];
  /** RNG seed for reproducibility. */
  seed: number;
  /** Session status. */
  status: "pending" | "active" | "completed" | "expired";
  /** Winner ID (if completed). */
  winnerId: UserId | null;
  /** Pending moves for current round. */
  pendingMoves: Map<UserId, CombatMove>;
}

/** Combat invite input. */
export interface CombatInviteInput {
  /** Inviter user ID. */
  inviterId: UserId;
  /** Target user ID. */
  targetId: UserId;
  /** Guild ID. */
  guildId?: string;
}

/** Combat accept input. */
export interface CombatAcceptInput {
  /** Session ID. */
  sessionId: string;
  /** Accepter user ID. */
  accepterId: UserId;
}

/** Submit move input. */
export interface SubmitMoveInput {
  /** Session ID. */
  sessionId: string;
  /** Player user ID. */
  playerId: UserId;
  /** Move to execute. */
  move: CombatMove;
}

/** Combat action result. */
export interface CombatActionResult {
  /** Whether the action succeeded. */
  success: boolean;
  /** Error message if failed. */
  error?: string;
  /** Current session state. */
  session?: ActiveCombatSession;
  /** Combat result if ended. */
  combatResult?: CombatResult;
}

/** Damage calculation input. */
export interface DamageCalculationInput {
  /** Attacker ATK. */
  attackerAtk: number;
  /** Defender DEF. */
  defenderDef: number;
  /** Attacker's move. */
  attackerMove: CombatMove;
  /** Defender's move. */
  defenderMove: CombatMove;
  /** Whether defender has shield item equipped. */
  defenderHasShieldItem: boolean;
  /** RNG seed offset for this calculation. */
  seedOffset: number;
}

/** Damage calculation result. */
export interface DamageCalculationResult {
  /** Damage dealt. */
  damage: number;
  /** Whether this was a critical hit. */
  isCrit: boolean;
  /** Whether defender blocked. */
  isBlocked: boolean;
  /** Whether block failed. */
  isFailedBlock: boolean;
}

/** RNG state for seeded random. */
export interface RngState {
  /** Current seed. */
  seed: number;
}
