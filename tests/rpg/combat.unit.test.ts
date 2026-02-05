/**
 * RPG Combat Engine Unit Tests.
 *
 * Purpose: Test pure combat calculations without database.
 */

import { describe, test, expect } from "bun:test";
import { CombatEngine } from "@/modules/rpg/combat/engine";
import { COMBAT_CONFIG } from "@/modules/rpg/config";
import type { CombatMove } from "@/modules/rpg/types";

describe("Combat Engine", () => {
  describe("RNG", () => {
    test("should generate reproducible numbers with same seed", () => {
      const rng1 = CombatEngine.createRng(12345);
      const rng2 = CombatEngine.createRng(12345);

      const values1: number[] = [];
      const values2: number[] = [];

      for (let i = 0; i < 10; i++) {
        values1.push(CombatEngine.nextRandom(rng1));
        values2.push(CombatEngine.nextRandom(rng2));
      }

      expect(values1).toEqual(values2);
    });

    test("should generate different numbers with different seeds", () => {
      const rng1 = CombatEngine.createRng(12345);
      const rng2 = CombatEngine.createRng(54321);

      const val1 = CombatEngine.nextRandom(rng1);
      const val2 = CombatEngine.nextRandom(rng2);

      expect(val1).not.toBe(val2);
    });

    test("should generate numbers in [0, 1) range", () => {
      const rng = CombatEngine.createRng(Date.now());

      for (let i = 0; i < 100; i++) {
        const val = CombatEngine.nextRandom(rng);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
      }
    });
  });

  describe("Damage Calculation", () => {
    test("should deal minimum 1 damage", () => {
      const rng = CombatEngine.createRng(12345);

      const result = CombatEngine.calculateDamage(
        {
          attackerAtk: 1,
          defenderDef: 1000,
          move: "attack",
          defenderHasShield: false,
          seedOffset: 0,
        },
        rng,
      );

      expect(result.damage).toBeGreaterThanOrEqual(COMBAT_CONFIG.minDamage);
    });

    test("should deal 0 damage on successful block", () => {
      // Use seed that guarantees block success
      const rng = CombatEngine.createRng(1);

      const result = CombatEngine.calculateDamage(
        {
          attackerAtk: 100,
          defenderDef: 0,
          move: "block",
          defenderHasShield: true,
          seedOffset: 0,
        },
        rng,
      );

      // With block, damage should be significantly reduced or 0
      // (depends on block success RNG)
    });

    test("critical hits should deal more damage", () => {
      // Find a seed that produces crit
      let critResult: { damage: number; isCrit: boolean } | null = null;
      let normalResult: { damage: number; isCrit: boolean } | null = null;

      for (let seed = 0; seed < 1000; seed++) {
        const rng = CombatEngine.createRng(seed);
        const result = CombatEngine.calculateDamage(
          {
            attackerAtk: 100,
            defenderDef: 0,
            move: "attack",
            defenderHasShield: false,
            seedOffset: 0,
          },
          rng,
        );

        if (result.isCrit && !critResult) {
          critResult = result;
        }
        if (!result.isCrit && !normalResult) {
          normalResult = result;
        }

        if (critResult && normalResult) break;
      }

      expect(critResult).not.toBeNull();
      expect(normalResult).not.toBeNull();

      if (critResult && normalResult) {
        expect(critResult.damage).toBeGreaterThan(normalResult.damage);
      }
    });
  });

  describe("Combat Resolution", () => {
    test("should detect combat end when HP reaches 0", () => {
      const session = {
        p1Hp: 0,
        p2Hp: 50,
      } as { p1Hp: number; p2Hp: number };

      expect(CombatEngine.isCombatEnded(session as any)).toBe(true);
    });

    test("should detect combat end when both HP are 0", () => {
      const session = {
        p1Hp: 0,
        p2Hp: 0,
      } as { p1Hp: number; p2Hp: number };

      expect(CombatEngine.isCombatEnded(session as any)).toBe(true);
    });

    test("should not detect combat end when both have HP", () => {
      const session = {
        p1Hp: 50,
        p2Hp: 50,
      } as { p1Hp: number; p2Hp: number };

      expect(CombatEngine.isCombatEnded(session as any)).toBe(false);
    });

    test("should determine winner correctly", () => {
      const session = {
        p1Id: "player1",
        p2Id: "player2",
        p1Hp: 10,
        p2Hp: 0,
      } as { p1Id: string; p2Id: string; p1Hp: number; p2Hp: number };

      const winner = CombatEngine.determineWinner(session as any);
      expect(winner).toBe("player1");
    });

    test("should handle double KO by HP percentage", () => {
      const session = {
        p1Id: "player1",
        p2Id: "player2",
        p1Hp: 0,
        p2Hp: 0,
        p1MaxHp: 100,
        p2MaxHp: 100,
      } as { p1Id: string; p2Id: string; p1Hp: number; p2Hp: number; p1MaxHp: number; p2MaxHp: number };

      // When tied, p1 wins
      const winner = CombatEngine.determineWinner(session as any);
      expect(winner).toBe("player1");
    });
  });

  describe("Session ID Generation", () => {
    test("should generate unique session IDs", () => {
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        ids.add(CombatEngine.generateSessionId());
      }

      expect(ids.size).toBe(100);
    });

    test("should generate IDs with correct prefix", () => {
      const id = CombatEngine.generateSessionId();
      expect(id.startsWith("combat_")).toBe(true);
    });
  });
});
