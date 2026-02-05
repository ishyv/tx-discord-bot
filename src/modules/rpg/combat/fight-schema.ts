/**
 * RPG Fight Schema.
 *
 * Purpose: Zod schema for persistent combat fights in MongoDB.
 * Context: Stored in rpg_fights collection with TTL on expiresAt.
 */

import { z } from "zod";

/** Player snapshot with stats at fight start. */
export const FightPlayerSnapshotSchema = z.object({
  userId: z.string(),
  maxHp: z.number().int().min(1),
  currentHp: z.number().int().min(0),
  atk: z.number().int().min(0),
  def: z.number().int().min(0),
  hasShield: z.boolean(),
});

/** Combat move type. */
export const CombatMoveSchema = z.enum(["attack", "block", "crit", "failed_block"]);

/** Round record. */
export const FightRoundSchema = z.object({
  roundNumber: z.number().int().min(1),
  p1Move: CombatMoveSchema,
  p2Move: CombatMoveSchema,
  p1Damage: z.number().int().min(0),
  p2Damage: z.number().int().min(0),
  p1Hp: z.number().int().min(0),
  p2Hp: z.number().int().min(0),
  resolvedAt: z.string().datetime(),
});

/** Fight status. */
export const FightStatusSchema = z.enum([
  "pending",   // Challenge sent, waiting for accept
  "active",    // Fight in progress
  "completed", // Fight finished normally
  "expired",   // TTL expired
  "forfeited", // Someone forfeited
]);

/** Main fight document schema. */
export const RpgFightSchema = z.object({
  _id: z.string(),
  
  // Players
  p1Id: z.string(),
  p2Id: z.string(),
  
  // Snapshots (set on accept)
  p1Snapshot: FightPlayerSnapshotSchema.nullable(),
  p2Snapshot: FightPlayerSnapshotSchema.nullable(),
  
  // Current state
  currentRound: z.number().int().min(1).default(1),
  p1Hp: z.number().int().min(0),
  p2Hp: z.number().int().min(0),
  
  // Pending moves for current round
  p1PendingMove: CombatMoveSchema.nullable().default(null),
  p2PendingMove: CombatMoveSchema.nullable().default(null),
  
  // RNG seed for reproducibility
  seed: z.number().int(),
  
  // Status and lifecycle
  status: FightStatusSchema.default("pending"),
  winnerId: z.string().nullable().default(null),
  
  // Rounds history
  rounds: z.array(FightRoundSchema).default([]),
  
  // Timing
  createdAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable().default(null),
  expiresAt: z.string().datetime(), // TTL index target
  finishedAt: z.string().datetime().nullable().default(null),
  
  // Audit
  correlationId: z.string(),
  guildId: z.string().optional(),
});

export type RpgFightData = z.infer<typeof RpgFightSchema>;
export type FightPlayerSnapshot = z.infer<typeof FightPlayerSnapshotSchema>;
export type FightRound = z.infer<typeof FightRoundSchema>;
export type FightStatus = z.infer<typeof FightStatusSchema>;
export type CombatMove = z.infer<typeof CombatMoveSchema>;

/** Create new fight data. */
export function createFightData(
  fightId: string,
  p1Id: string,
  p2Id: string,
  seed: number,
  expiresAt: Date,
  correlationId: string,
  guildId?: string,
): RpgFightData {
  const now = new Date();
  return {
    _id: fightId,
    p1Id,
    p2Id,
    p1Snapshot: null,
    p2Snapshot: null,
    currentRound: 1,
    p1Hp: 0, // Set on accept
    p2Hp: 0, // Set on accept
    p1PendingMove: null,
    p2PendingMove: null,
    seed,
    status: "pending",
    winnerId: null,
    rounds: [],
    createdAt: now.toISOString(),
    acceptedAt: null,
    expiresAt: expiresAt.toISOString(),
    finishedAt: null,
    correlationId,
    guildId,
  };
}
