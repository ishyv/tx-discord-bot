/**
 * RPG Stats Calculator Unit Tests.
 *
 * Purpose: Test pure stat calculation functions including:
 * - Stat stacking from equipment
 * - Missing slot handling
 * - HP clamp behavior
 */
import { describe, it, expect } from "vitest";
import {
  calcStats,
  clampHp,
  calcStatsDelta,
  computeCombatSnapshot,
  adjustHpOnMaxChange,
  StatsCalculator,
} from "@/modules/rpg/stats/calculator";
import type { Loadout } from "@/db/schemas/rpg-profile";
import type { ItemStatsResolver } from "@/modules/rpg/stats/calculator";

// Test item definitions
const TEST_ITEMS: Record<string, { atk?: number; def?: number; hp?: number }> = {
  wooden_sword: { atk: 5 },
  steel_sword: { atk: 15, hp: 5 },
  iron_shield: { def: 10 },
  leather_helmet: { def: 3 },
  iron_armor: { def: 20, hp: 25 },
  leather_pants: { def: 3 },
  leather_boots: { def: 2 },
  health_ring: { hp: 25 },
  power_amulet: { atk: 3 },
};

const itemResolver: ItemStatsResolver = (itemId: string) => TEST_ITEMS[itemId] ?? null;

describe("calcStats", () => {
  it("should return base stats with empty loadout", () => {
    const loadout: Loadout = {
      weapon: null,
      shield: null,
      helmet: null,
      chest: null,
      pants: null,
      boots: null,
      ring: null,
      necklace: null,
    };

    const stats = calcStats(loadout, itemResolver);

    expect(stats.atk).toBe(0);
    expect(stats.def).toBe(0);
    expect(stats.maxHp).toBe(100); // Base HP
  });

  it("should calculate single weapon stats", () => {
    const loadout: Loadout = {
      weapon: "wooden_sword",
      shield: null,
      helmet: null,
      chest: null,
      pants: null,
      boots: null,
      ring: null,
      necklace: null,
    };

    const stats = calcStats(loadout, itemResolver);

    expect(stats.atk).toBe(5);
    expect(stats.def).toBe(0);
    expect(stats.maxHp).toBe(100);
  });

  it("should stack stats from multiple items", () => {
    const loadout: Loadout = {
      weapon: "steel_sword", // atk: 15, hp: 5
      shield: "iron_shield", // def: 10
      helmet: "leather_helmet", // def: 3
      chest: "iron_armor", // def: 20, hp: 25
      pants: "leather_pants", // def: 3
      boots: "leather_boots", // def: 2
      ring: "health_ring", // hp: 25
      necklace: "power_amulet", // atk: 3
    };

    const stats = calcStats(loadout, itemResolver);

    expect(stats.atk).toBe(15 + 3); // steel_sword + power_amulet
    expect(stats.def).toBe(10 + 3 + 20 + 3 + 2); // shield + helmet + chest + pants + boots
    expect(stats.maxHp).toBe(100 + 5 + 25 + 25); // base + sword + armor + ring
  });

  it("should handle missing item definitions gracefully", () => {
    const loadout: Loadout = {
      weapon: "unknown_weapon",
      shield: null,
      helmet: null,
      chest: null,
      pants: null,
      boots: null,
      ring: null,
      necklace: null,
    };

    const stats = calcStats(loadout, itemResolver);

    expect(stats.atk).toBe(0);
    expect(stats.def).toBe(0);
    expect(stats.maxHp).toBe(100);
  });

  it("should handle partial equipment (some slots filled)", () => {
    const loadout: Loadout = {
      weapon: "wooden_sword",
      shield: null,
      helmet: null,
      chest: null,
      pants: null,
      boots: null,
      ring: "health_ring",
      necklace: null,
    };

    const stats = calcStats(loadout, itemResolver);

    expect(stats.atk).toBe(5);
    expect(stats.maxHp).toBe(125); // 100 base + 25 from ring
  });

  it("should return zeros for items without stats", () => {
    const emptyItemResolver: ItemStatsResolver = () => ({ atk: 0, def: 0, hp: 0 });
    const loadout: Loadout = {
      weapon: "some_item",
      shield: null,
      helmet: null,
      chest: null,
      pants: null,
      boots: null,
      ring: null,
      necklace: null,
    };

    const stats = calcStats(loadout, emptyItemResolver);

    expect(stats.atk).toBe(0);
    expect(stats.def).toBe(0);
    expect(stats.maxHp).toBe(100);
  });
});

describe("clampHp", () => {
  it("should return current HP when below max", () => {
    expect(clampHp(50, 100)).toBe(50);
    expect(clampHp(99, 100)).toBe(99);
  });

  it("should clamp HP to max when exceeding", () => {
    expect(clampHp(150, 100)).toBe(100);
    expect(clampHp(101, 100)).toBe(100);
  });

  it("should clamp negative HP to zero", () => {
    expect(clampHp(-10, 100)).toBe(0);
    expect(clampHp(0, 100)).toBe(0);
  });

  it("should floor decimal values", () => {
    expect(clampHp(50.9, 100)).toBe(50);
    expect(clampHp(100.1, 100)).toBe(100);
  });

  it("should handle edge case of maxHp = 0", () => {
    expect(clampHp(50, 0)).toBe(0);
  });
});

describe("calcStatsDelta", () => {
  it("should calculate positive delta when equipping better gear", () => {
    const currentLoadout: Loadout = {
      weapon: "wooden_sword",
      shield: null,
      helmet: null,
      chest: null,
      pants: null,
      boots: null,
      ring: null,
      necklace: null,
    };

    const newLoadout: Loadout = {
      weapon: "steel_sword",
      shield: null,
      helmet: null,
      chest: null,
      pants: null,
      boots: null,
      ring: null,
      necklace: null,
    };

    const delta = calcStatsDelta(currentLoadout, newLoadout, itemResolver);

    expect(delta.atkDelta).toBe(10); // 15 - 5
    expect(delta.defDelta).toBe(0);
    expect(delta.maxHpDelta).toBe(5); // +5 HP from steel sword
  });

  it("should calculate negative delta when unequipping gear", () => {
    const currentLoadout: Loadout = {
      weapon: "steel_sword",
      shield: null,
      helmet: null,
      chest: null,
      pants: null,
      boots: null,
      ring: "health_ring",
      necklace: null,
    };

    const newLoadout: Loadout = {
      weapon: null,
      shield: null,
      helmet: null,
      chest: null,
      pants: null,
      boots: null,
      ring: null,
      necklace: null,
    };

    const delta = calcStatsDelta(currentLoadout, newLoadout, itemResolver);

    expect(delta.atkDelta).toBe(-15);
    expect(delta.defDelta).toBe(0);
    expect(delta.maxHpDelta).toBe(-30); // -5 from sword, -25 from ring
  });

  it("should return zero delta for identical loadouts", () => {
    const loadout: Loadout = {
      weapon: "steel_sword",
      shield: "iron_shield",
      helmet: null,
      chest: null,
      pants: null,
      boots: null,
      ring: null,
      necklace: null,
    };

    const delta = calcStatsDelta(loadout, loadout, itemResolver);

    expect(delta.atkDelta).toBe(0);
    expect(delta.defDelta).toBe(0);
    expect(delta.maxHpDelta).toBe(0);
  });

  it("should calculate mixed changes (some up, some down)", () => {
    const currentLoadout: Loadout = {
      weapon: "steel_sword", // atk: 15, hp: 5
      shield: null,
      helmet: null,
      chest: null,
      pants: null,
      boots: null,
      ring: null,
      necklace: null,
    };

    const newLoadout: Loadout = {
      weapon: "wooden_sword", // atk: 5
      shield: "iron_shield", // def: 10
      helmet: null,
      chest: null,
      pants: null,
      boots: null,
      ring: "health_ring", // hp: 25
      necklace: null,
    };

    const delta = calcStatsDelta(currentLoadout, newLoadout, itemResolver);

    expect(delta.atkDelta).toBe(-10); // 5 - 15
    expect(delta.defDelta).toBe(10); // 10 - 0
    expect(delta.maxHpDelta).toBe(20); // +25 from ring, -5 from losing steel sword
  });
});

describe("computeCombatSnapshot", () => {
  it("should create snapshot with full stats", () => {
    const loadout: Loadout = {
      weapon: "wooden_sword",
      shield: "iron_shield",
      helmet: null,
      chest: null,
      pants: null,
      boots: null,
      ring: null,
      necklace: null,
    };

    const snapshot = computeCombatSnapshot(loadout, 100, itemResolver);

    expect(snapshot.atk).toBe(5);
    expect(snapshot.def).toBe(10);
    expect(snapshot.maxHp).toBe(100);
    expect(snapshot.hpCurrent).toBe(100);
  });

  it("should clamp hpCurrent to maxHp in snapshot", () => {
    const loadout: Loadout = {
      weapon: null,
      shield: null,
      helmet: null,
      chest: null,
      pants: null,
      boots: null,
      ring: "health_ring", // +25 HP
      necklace: null,
    };

    const snapshot = computeCombatSnapshot(loadout, 150, itemResolver);

    expect(snapshot.maxHp).toBe(125); // 100 + 25
    expect(snapshot.hpCurrent).toBe(125); // clamped from 150
  });

  it("should preserve hpCurrent when below max", () => {
    const loadout: Loadout = {
      weapon: null,
      shield: null,
      helmet: null,
      chest: null,
      pants: null,
      boots: null,
      ring: null,
      necklace: null,
    };

    const snapshot = computeCombatSnapshot(loadout, 75, itemResolver);

    expect(snapshot.maxHp).toBe(100);
    expect(snapshot.hpCurrent).toBe(75);
  });
});

describe("adjustHpOnMaxChange", () => {
  it("should preserve current HP when max HP increases", () => {
    expect(adjustHpOnMaxChange(80, 100, 150)).toBe(80);
    expect(adjustHpOnMaxChange(100, 100, 200)).toBe(100);
  });

  it("should clamp current HP when max HP decreases", () => {
    expect(adjustHpOnMaxChange(80, 150, 100)).toBe(80); // Still under new max
    expect(adjustHpOnMaxChange(120, 150, 100)).toBe(100); // Clamped to new max
    expect(adjustHpOnMaxChange(150, 200, 100)).toBe(100); // Clamped to new max
  });

  it("should handle edge case of no change in max HP", () => {
    expect(adjustHpOnMaxChange(80, 100, 100)).toBe(80);
  });

  it("should handle very low max HP", () => {
    expect(adjustHpOnMaxChange(50, 100, 1)).toBe(1);
    expect(adjustHpOnMaxChange(0, 100, 1)).toBe(0);
  });
});

describe("StatsCalculator namespace", () => {
  it("should provide legacy calculate interface", () => {
    const loadout: Loadout = {
      weapon: "wooden_sword",
      shield: null,
      helmet: null,
      chest: null,
      pants: null,
      boots: null,
      ring: null,
      necklace: null,
    };

    const stats = StatsCalculator.calculate({
      equipment: loadout,
      resolveItem: itemResolver,
    });

    expect(stats.atk).toBe(5);
    expect(stats.maxHp).toBe(100);
  });

  it("should provide new calcStats interface", () => {
    const loadout: Loadout = {
      weapon: "steel_sword",
      shield: null,
      helmet: null,
      chest: null,
      pants: null,
      boots: null,
      ring: null,
      necklace: null,
    };

    const stats = StatsCalculator.calcStats(loadout, itemResolver);

    expect(stats.atk).toBe(15);
    expect(stats.maxHp).toBe(105);
  });

  it("should provide adjustCurrentHp alias", () => {
    expect(StatsCalculator.adjustCurrentHp(80, 100, 150)).toBe(80);
    expect(StatsCalculator.adjustCurrentHp(120, 150, 100)).toBe(100);
  });
});
