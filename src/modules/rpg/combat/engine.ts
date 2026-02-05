/**
 * Combat Engine.
 *
 * Purpose: Pure functions for combat calculations and RNG.
 * Context: Damage formulas, seeded random, move resolution.
 * Dependencies: None (pure logic).
 *
 * Invariants:
 * - Seeded RNG for reproducibility.
 * - Minimum 1 damage per successful hit.
 * - Defense and block reduce damage.
 */

import { COMBAT_CONFIG } from "../config";
import type { CombatMove, CombatRound, CombatResult } from "../types";
import type {
  DamageCalculationInput,
  DamageCalculationResult,
  RngState,
  ActiveCombatSession,
} from "./types";

/** Seeded random number generator (Mulberry32). */
export function createRng(seed: number): RngState {
  return { seed: seed >>> 0 };
}

/** Get next random number between 0 and 1. */
export function nextRandom(rng: RngState): number {
  let t = (rng.seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Random integer in range [min, max]. */
export function nextInt(rng: RngState, min: number, max: number): number {
  return Math.floor(nextRandom(rng) * (max - min + 1)) + min;
}

/** Random float in range [min, max). */
export function nextFloat(rng: RngState, min: number, max: number): number {
  return nextRandom(rng) * (max - min) + min;
}

/** Calculate damage for a single attack. */
export function calculateDamage(
  input: DamageCalculationInput,
  rng: RngState,
): DamageCalculationResult {
  const { attackerAtk, defenderDef, attackerMove, defenderMove, defenderHasShieldItem } = input;

  // If attacker blocks, they deal no damage (defensive stance)
  if (attackerMove === "block") {
    return { damage: 0, isCrit: false, isBlocked: false, isFailedBlock: false };
  }

  // Handle defender block attempt
  if (defenderMove === "block") {
    // Determine block success based on shield ownership
    // If has shield, standard block chance. If no shield, lower chance? 
    // Config says "blockChance". Assume requires shield for effective block?
    // Or maybe "failed block" is just partial damage.

    // Let's assume standard block logic:
    const blockSuccess = nextRandom(rng) < COMBAT_CONFIG.blockChance;

    if (blockSuccess && defenderHasShieldItem) {
      // Successful block with shield
      const reduction = nextFloat(rng, COMBAT_CONFIG.blockDamageReduction.min, COMBAT_CONFIG.blockDamageReduction.max);
      const damage = Math.max(
        COMBAT_CONFIG.minDamage,
        Math.floor(attackerAtk * (1 - reduction)),
      );
      return { damage, isCrit: false, isBlocked: true, isFailedBlock: false };
    }

    // Failed block or blocking without shield (minimal reduction)
    const damage = Math.max(
      COMBAT_CONFIG.minDamage,
      Math.floor(attackerAtk * 0.95) - Math.floor(defenderDef * 0.05),
    );
    return { damage, isCrit: false, isBlocked: false, isFailedBlock: true };
  }

  // Normal Attack vs No Block

  // Determine if critical hit
  const isCrit = nextRandom(rng) < COMBAT_CONFIG.critChance;

  // Calculate base damage
  let baseDamage: number;
  if (isCrit) {
    baseDamage = nextFloat(rng, COMBAT_CONFIG.critMultiplier.min, COMBAT_CONFIG.critMultiplier.max) * attackerAtk;
  } else {
    baseDamage = nextFloat(rng, COMBAT_CONFIG.damageVariance.min, COMBAT_CONFIG.damageVariance.max) * attackerAtk;
  }

  // Apply defense reduction
  const defenseReduction = nextFloat(rng, COMBAT_CONFIG.defenseReduction.min, COMBAT_CONFIG.defenseReduction.max) * defenderDef;
  const damage = Math.max(COMBAT_CONFIG.minDamage, Math.floor(baseDamage - defenseReduction));

  return { damage, isCrit, isBlocked: false, isFailedBlock: false };
}

/** Resolve a single combat round. */
export function resolveRound(
  session: ActiveCombatSession,
  p1Move: CombatMove,
  p2Move: CombatMove,
): CombatRound {
  const rng = createRng(session.seed + session.currentRound);

  // Calculate both damages simultaneously
  const p1Attack = calculateDamage(
    {
      attackerAtk: session.p1Atk,
      defenderDef: session.p2Def,
      attackerMove: p1Move,
      defenderMove: p2Move,
      defenderHasShieldItem: session.p2HasShield,
      seedOffset: session.currentRound * 2,
    },
    rng,
  );

  const p2Attack = calculateDamage(
    {
      attackerAtk: session.p2Atk,
      defenderDef: session.p1Def,
      attackerMove: p2Move,
      defenderMove: p1Move,
      defenderHasShieldItem: session.p1HasShield,
      seedOffset: session.currentRound * 2 + 1,
    },
    rng,
  );

  // Apply damage simultaneously
  const p1Hp = Math.max(0, session.p1Hp - p2Attack.damage);
  const p2Hp = Math.max(0, session.p2Hp - p1Attack.damage);

  // Determine effective moves (crit, failed_block, etc.)
  const p1EffectiveMove: CombatMove = p1Attack.isCrit
    ? "crit"
    : p1Attack.isFailedBlock
      ? "failed_block"
      : p1Move;

  const p2EffectiveMove: CombatMove = p2Attack.isCrit
    ? "crit"
    : p2Attack.isFailedBlock
      ? "failed_block"
      : p2Move;

  return {
    roundNumber: session.currentRound,
    p1Move: p1EffectiveMove,
    p2Move: p2EffectiveMove,
    p1Damage: p2Attack.damage,
    p2Damage: p1Attack.damage,
    p1Hp,
    p2Hp,
    seed: session.seed + session.currentRound,
  };
}

/** Check if combat has ended. */
export function isCombatEnded(session: ActiveCombatSession): boolean {
  return session.p1Hp <= 0 || session.p2Hp <= 0;
}

/** Determine winner. */
export function determineWinner(session: ActiveCombatSession): string | null {
  if (session.p1Hp <= 0 && session.p2Hp <= 0) {
    // Double KO - player with higher HP percentage wins (or p1 if tied)
    const p1HpPercent = session.p1Hp / session.p1MaxHp;
    const p2HpPercent = session.p2Hp / session.p2MaxHp;
    return p1HpPercent >= p2HpPercent ? session.p1Id : session.p2Id;
  }
  if (session.p1Hp <= 0) return session.p2Id;
  if (session.p2Hp <= 0) return session.p1Id;
  return null;
}

/** Build final combat result. */
export function buildCombatResult(
  session: ActiveCombatSession,
): CombatResult {
  const winnerId = determineWinner(session)!;
  const loserId = winnerId === session.p1Id ? session.p2Id : session.p1Id;

  return {
    sessionId: session.id,
    winnerId,
    loserId,
    totalRounds: session.currentRound,
    finalHp: {
      winner: winnerId === session.p1Id ? session.p1Hp : session.p2Hp,
      loser: winnerId === session.p1Id ? session.p2Hp : session.p1Hp,
    },
    rounds: session.rounds,
    endedAt: new Date(),
  };
}

/** Generate unique session ID. */
export function generateSessionId(): string {
  return `combat_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/** Combat Engine namespace. */
export const CombatEngine = {
  createRng,
  nextRandom,
  nextInt,
  nextFloat,
  calculateDamage,
  resolveRound,
  isCombatEnded,
  determineWinner,
  buildCombatResult,
  generateSessionId,
} as const;
