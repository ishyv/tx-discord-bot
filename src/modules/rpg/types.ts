/**
 * Core RPG Types.
 *
 * Purpose: Shared type definitions for the RPG system.
 * Context: Used across profile, combat, equipment, and other modules.
 */

import type { EquipmentSlot } from "./config";

/** Equipment slots with item IDs. */
export type EquipmentSlots = {
  [K in EquipmentSlot]: string | null;
};

/** Combat stats derived from equipment. */
export interface CombatStats {
  /** Attack power. */
  atk: number;
  /** Defense power. */
  def: number;
  /** Maximum HP. */
  maxHp: number;
}

/** Current combat state. */
export interface CombatState {
  /** Current HP (<= maxHp). */
  currentHp: number;
  /** Whether currently in combat. */
  isFighting: boolean;
  /** Active combat session ID (if fighting). */
  sessionId: string | null;
}

/** Combat record tracking. */
export interface CombatRecord {
  /** Total victories. */
  wins: number;
  /** Total defeats. */
  losses: number;
}

/** Tool instance with durability. */
export interface ToolInstance {
  /** Tool item ID. */
  itemId: string;
  /** Current durability. */
  durability: number;
  /** Maximum durability (for display). */
  maxDurability: number;
}

/** Complete RPG profile. */
export interface RpgProfile {
  /** User ID. */
  userId: string;
  /** Equipped items by slot. */
  equipment: EquipmentSlots;
  /** Current combat state. */
  combat: CombatState;
  /** Combat record. */
  record: CombatRecord;
  /** Timestamps. */
  createdAt: Date;
  updatedAt: Date;
}

/** Combat move types. */
export type CombatMove = "attack" | "block" | "crit" | "failed_block";

/** Single combat round result. */
export interface CombatRound {
  /** Round number (1-indexed). */
  roundNumber: number;
  /** Player 1 move. */
  p1Move: CombatMove;
  /** Player 2 move. */
  p2Move: CombatMove;
  /** Damage dealt by player 1. */
  p1Damage: number;
  /** Damage dealt by player 2. */
  p2Damage: number;
  /** Player 1 HP after round. */
  p1Hp: number;
  /** Player 2 HP after round. */
  p2Hp: number;
  /** RNG seed used for this round. */
  seed: number;
}

/** Combat session state. */
export interface CombatSession {
  /** Unique session ID. */
  id: string;
  /** Player 1 ID. */
  p1Id: string;
  /** Player 2 ID. */
  p2Id: string;
  /** Combat start time. */
  startedAt: Date;
  /** Session expiration time. */
  expiresAt: Date;
  /** Current round number. */
  currentRound: number;
  /** Combat log (rounds history). */
  rounds: CombatRound[];
  /** Current HP for player 1. */
  p1Hp: number;
  /** Current HP for player 2. */
  p2Hp: number;
  /** RNG seed for reproducibility. */
  seed: number;
  /** Session status. */
  status: "pending" | "active" | "completed" | "expired";
  /** Winner ID (if completed). */
  winnerId: string | null;
}

/** Final combat result. */
export interface CombatResult {
  /** Session ID. */
  sessionId: string;
  /** Winner user ID. */
  winnerId: string;
  /** Loser user ID. */
  loserId: string;
  /** Total rounds fought. */
  totalRounds: number;
  /** Final HP values. */
  finalHp: { winner: number; loser: number };
  /** Combat log. */
  rounds: CombatRound[];
  /** Combat end time. */
  endedAt: Date;
}
