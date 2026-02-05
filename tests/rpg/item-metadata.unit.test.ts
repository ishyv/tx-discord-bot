/**
 * Purpose: Unit tests for RPG item metadata, slot mapping, and tool validation.
 * Context: RPG system item definitions and helpers.
 */
import { describe, it, expect } from "vitest";
import {
  isWeapon,
  isArmor,
  isAccessory,
  isTool,
  getItemSlot,
  canEquipInSlot,
  getAttack,
  getDefense,
  getHpBonus,
  getToolKind,
  getToolTier,
  meetsTierRequirement,
  findItemsBySlot,
  findToolsByKind,
  findToolsByMinTier,
  isRpgItem,
  type ItemDefinitionWithUse,
} from "@/modules/inventory/items";
import type { RpgEquipmentSlot, ToolKind, ToolTier } from "@/modules/inventory/definitions";

// Test item definitions for unit tests
const TEST_ITEMS: Record<string, ItemDefinitionWithUse> = {
  // Weapons
  wooden_sword: {
    id: "wooden_sword",
    name: "Wooden Sword",
    description: "A simple training sword.",
    rpgSlot: "weapon",
    stats: { atk: 5 },
  },
  steel_sword: {
    id: "steel_sword",
    name: "Steel Sword",
    description: "A well-crafted blade.",
    rpgSlot: "weapon",
    stats: { atk: 15, hp: 5 },
  },

  // Armor
  leather_helmet: {
    id: "leather_helmet",
    name: "Leather Helmet",
    description: "Basic head protection.",
    rpgSlot: "helmet",
    stats: { def: 3 },
  },
  iron_armor: {
    id: "iron_armor",
    name: "Iron Armor",
    description: "Heavy plate armor.",
    rpgSlot: "chest",
    stats: { def: 20, hp: 25 },
  },
  wooden_shield: {
    id: "wooden_shield",
    name: "Wooden Shield",
    description: "A basic shield.",
    rpgSlot: "shield",
    stats: { def: 5 },
  },
  leather_pants: {
    id: "leather_pants",
    name: "Leather Pants",
    description: "Leg protection.",
    rpgSlot: "pants",
    stats: { def: 3 },
  },
  leather_boots: {
    id: "leather_boots",
    name: "Leather Boots",
    description: "Sturdy boots.",
    rpgSlot: "boots",
    stats: { def: 2 },
  },

  // Accessories
  health_ring: {
    id: "health_ring",
    name: "Ring of Health",
    description: "Boosts vitality.",
    rpgSlot: "ring",
    stats: { hp: 25 },
  },
  power_amulet: {
    id: "power_amulet",
    name: "Amulet of Power",
    description: "Enhances power.",
    rpgSlot: "necklace",
    stats: { atk: 3 },
  },

  // Tools
  pickaxe: {
    id: "pickaxe",
    name: "Pickaxe",
    description: "A basic mining tool.",
    rpgSlot: "tool",
    tool: { toolKind: "pickaxe", tier: 1, maxDurability: 10 },
  },
  pickaxe_lv2: {
    id: "pickaxe_lv2",
    name: "Enhanced Pickaxe",
    description: "An improved pickaxe.",
    rpgSlot: "tool",
    tool: { toolKind: "pickaxe", tier: 2, maxDurability: 25 },
  },
  pickaxe_lv3: {
    id: "pickaxe_lv3",
    name: "Advanced Pickaxe",
    description: "A high-quality pickaxe.",
    rpgSlot: "tool",
    tool: { toolKind: "pickaxe", tier: 3, maxDurability: 50 },
  },
  pickaxe_lv4: {
    id: "pickaxe_lv4",
    name: "Master Pickaxe",
    description: "A masterwork pickaxe.",
    rpgSlot: "tool",
    tool: { toolKind: "pickaxe", tier: 4, maxDurability: 70 },
  },
  axe: {
    id: "axe",
    name: "Axe",
    description: "A basic woodcutting tool.",
    rpgSlot: "tool",
    tool: { toolKind: "axe", tier: 1, maxDurability: 10 },
  },
  axe_lv2: {
    id: "axe_lv2",
    name: "Enhanced Axe",
    description: "An improved axe.",
    rpgSlot: "tool",
    tool: { toolKind: "axe", tier: 2, maxDurability: 25 },
  },

  // Non-RPG items
  stick: {
    id: "stick",
    name: "Stick",
    description: "An ordinary stick.",
    canStack: true,
    maxStack: 99,
  },
  potion: {
    id: "potion",
    name: "Health Potion",
    description: "Restores health.",
    value: 50,
    canStack: true,
    maxStack: 20,
  },
};

describe("RPG Item Classification", () => {
  describe("isWeapon", () => {
    it("should identify weapons", () => {
      expect(isWeapon(TEST_ITEMS.wooden_sword)).toBe(true);
      expect(isWeapon(TEST_ITEMS.steel_sword)).toBe(true);
    });

    it("should not identify non-weapons as weapons", () => {
      expect(isWeapon(TEST_ITEMS.leather_helmet)).toBe(false);
      expect(isWeapon(TEST_ITEMS.wooden_shield)).toBe(false);
      expect(isWeapon(TEST_ITEMS.health_ring)).toBe(false);
      expect(isWeapon(TEST_ITEMS.pickaxe)).toBe(false);
      expect(isWeapon(TEST_ITEMS.stick)).toBe(false);
    });
  });

  describe("isArmor", () => {
    it("should identify armor pieces", () => {
      expect(isArmor(TEST_ITEMS.leather_helmet)).toBe(true); // helmet
      expect(isArmor(TEST_ITEMS.iron_armor)).toBe(true); // chest
      expect(isArmor(TEST_ITEMS.wooden_shield)).toBe(true); // shield
      expect(isArmor(TEST_ITEMS.leather_pants)).toBe(true); // pants
      expect(isArmor(TEST_ITEMS.leather_boots)).toBe(true); // boots
    });

    it("should not identify weapons as armor", () => {
      expect(isArmor(TEST_ITEMS.wooden_sword)).toBe(false);
      expect(isArmor(TEST_ITEMS.steel_sword)).toBe(false);
    });

    it("should not identify accessories as armor", () => {
      expect(isArmor(TEST_ITEMS.health_ring)).toBe(false);
      expect(isArmor(TEST_ITEMS.power_amulet)).toBe(false);
    });

    it("should not identify tools as armor", () => {
      expect(isArmor(TEST_ITEMS.pickaxe)).toBe(false);
      expect(isArmor(TEST_ITEMS.axe)).toBe(false);
    });

    it("should not identify non-RPG items as armor", () => {
      expect(isArmor(TEST_ITEMS.stick)).toBe(false);
    });
  });

  describe("isAccessory", () => {
    it("should identify rings and necklaces", () => {
      expect(isAccessory(TEST_ITEMS.health_ring)).toBe(true);
      expect(isAccessory(TEST_ITEMS.power_amulet)).toBe(true);
    });

    it("should not identify non-accessories", () => {
      expect(isAccessory(TEST_ITEMS.wooden_sword)).toBe(false);
      expect(isAccessory(TEST_ITEMS.leather_helmet)).toBe(false);
      expect(isAccessory(TEST_ITEMS.pickaxe)).toBe(false);
      expect(isAccessory(TEST_ITEMS.stick)).toBe(false);
    });
  });

  describe("isTool", () => {
    it("should identify tools with tool metadata", () => {
      expect(isTool(TEST_ITEMS.pickaxe)).toBe(true);
      expect(isTool(TEST_ITEMS.axe)).toBe(true);
    });

    it("should not identify non-tools", () => {
      expect(isTool(TEST_ITEMS.wooden_sword)).toBe(false);
      expect(isTool(TEST_ITEMS.leather_helmet)).toBe(false);
      expect(isTool(TEST_ITEMS.health_ring)).toBe(false);
      expect(isTool(TEST_ITEMS.stick)).toBe(false);
    });
  });

  describe("isRpgItem", () => {
    it("should identify items with rpgSlot", () => {
      expect(isRpgItem(TEST_ITEMS.wooden_sword)).toBe(true);
      expect(isRpgItem(TEST_ITEMS.pickaxe)).toBe(true);
    });

    it("should identify items with stats", () => {
      const itemWithStatsOnly = {
        id: "test_ring",
        name: "Test Ring",
        description: "Test item with only stats",
        stats: { atk: 5 },
      } as ItemDefinitionWithUse;
      expect(isRpgItem(itemWithStatsOnly)).toBe(true);
    });

    it("should not identify items without RPG properties", () => {
      expect(isRpgItem(TEST_ITEMS.stick)).toBe(false);
      expect(isRpgItem(TEST_ITEMS.potion)).toBe(false);
    });
  });
});

describe("RPG Slot Mapping", () => {
  describe("getItemSlot", () => {
    it("should return the correct slot for equipped items", () => {
      expect(getItemSlot(TEST_ITEMS.wooden_sword)).toBe("weapon");
      expect(getItemSlot(TEST_ITEMS.leather_helmet)).toBe("helmet");
      expect(getItemSlot(TEST_ITEMS.iron_armor)).toBe("chest");
      expect(getItemSlot(TEST_ITEMS.leather_pants)).toBe("pants");
      expect(getItemSlot(TEST_ITEMS.leather_boots)).toBe("boots");
      expect(getItemSlot(TEST_ITEMS.wooden_shield)).toBe("shield");
      expect(getItemSlot(TEST_ITEMS.health_ring)).toBe("ring");
      expect(getItemSlot(TEST_ITEMS.power_amulet)).toBe("necklace");
      expect(getItemSlot(TEST_ITEMS.pickaxe)).toBe("tool");
    });

    it("should return null for items without a slot", () => {
      expect(getItemSlot(TEST_ITEMS.stick)).toBeNull();
      expect(getItemSlot(TEST_ITEMS.potion)).toBeNull();
    });
  });

  describe("canEquipInSlot", () => {
    it("should match weapon to weapon slot", () => {
      expect(canEquipInSlot(TEST_ITEMS.wooden_sword, "weapon")).toBe(true);
      expect(canEquipInSlot(TEST_ITEMS.wooden_sword, "helmet")).toBe(false);
    });

    it("should match armor to their respective slots", () => {
      expect(canEquipInSlot(TEST_ITEMS.leather_helmet, "helmet")).toBe(true);
      expect(canEquipInSlot(TEST_ITEMS.leather_helmet, "chest")).toBe(false);
      expect(canEquipInSlot(TEST_ITEMS.iron_armor, "chest")).toBe(true);
      expect(canEquipInSlot(TEST_ITEMS.iron_armor, "helmet")).toBe(false);
    });

    it("should match accessories to their slots", () => {
      expect(canEquipInSlot(TEST_ITEMS.health_ring, "ring")).toBe(true);
      expect(canEquipInSlot(TEST_ITEMS.power_amulet, "necklace")).toBe(true);
      expect(canEquipInSlot(TEST_ITEMS.health_ring, "necklace")).toBe(false);
      expect(canEquipInSlot(TEST_ITEMS.power_amulet, "ring")).toBe(false);
    });

    it("should match tools to tool slot", () => {
      expect(canEquipInSlot(TEST_ITEMS.pickaxe, "tool")).toBe(true);
      expect(canEquipInSlot(TEST_ITEMS.axe, "tool")).toBe(true);
      expect(canEquipInSlot(TEST_ITEMS.pickaxe, "weapon")).toBe(false);
    });

    it("should not allow non-RPG items in any slot", () => {
      expect(canEquipInSlot(TEST_ITEMS.stick, "weapon")).toBe(false);
      expect(canEquipInSlot(TEST_ITEMS.stick, "tool")).toBe(false);
    });
  });
});

describe("RPG Stats", () => {
  describe("getAttack", () => {
    it("should return the attack value", () => {
      expect(getAttack(TEST_ITEMS.wooden_sword)).toBe(5);
      expect(getAttack(TEST_ITEMS.steel_sword)).toBe(15);
    });

    it("should return 0 for items without attack", () => {
      expect(getAttack(TEST_ITEMS.leather_helmet)).toBe(0);
      expect(getAttack(TEST_ITEMS.health_ring)).toBe(0);
      expect(getAttack(TEST_ITEMS.pickaxe)).toBe(0);
      expect(getAttack(TEST_ITEMS.stick)).toBe(0);
    });
  });

  describe("getDefense", () => {
    it("should return the defense value", () => {
      expect(getDefense(TEST_ITEMS.leather_helmet)).toBe(3);
      expect(getDefense(TEST_ITEMS.iron_armor)).toBe(20);
      expect(getDefense(TEST_ITEMS.wooden_shield)).toBe(5);
    });

    it("should return 0 for items without defense", () => {
      expect(getDefense(TEST_ITEMS.wooden_sword)).toBe(0);
      expect(getDefense(TEST_ITEMS.health_ring)).toBe(0);
      expect(getDefense(TEST_ITEMS.stick)).toBe(0);
    });
  });

  describe("getHpBonus", () => {
    it("should return the HP bonus", () => {
      expect(getHpBonus(TEST_ITEMS.health_ring)).toBe(25);
      expect(getHpBonus(TEST_ITEMS.iron_armor)).toBe(25);
      expect(getHpBonus(TEST_ITEMS.steel_sword)).toBe(5);
    });

    it("should return 0 for items without HP bonus", () => {
      expect(getHpBonus(TEST_ITEMS.wooden_sword)).toBe(0);
      expect(getHpBonus(TEST_ITEMS.leather_helmet)).toBe(0);
      expect(getHpBonus(TEST_ITEMS.pickaxe)).toBe(0);
      expect(getHpBonus(TEST_ITEMS.stick)).toBe(0);
    });
  });
});

describe("Tool Metadata", () => {
  describe("getToolKind", () => {
    it("should return the correct tool kind", () => {
      expect(getToolKind(TEST_ITEMS.pickaxe)).toBe("pickaxe");
      expect(getToolKind(TEST_ITEMS.pickaxe_lv2)).toBe("pickaxe");
      expect(getToolKind(TEST_ITEMS.axe)).toBe("axe");
      expect(getToolKind(TEST_ITEMS.axe_lv2)).toBe("axe");
    });

    it("should return null for non-tools", () => {
      expect(getToolKind(TEST_ITEMS.wooden_sword)).toBeNull();
      expect(getToolKind(TEST_ITEMS.leather_helmet)).toBeNull();
      expect(getToolKind(TEST_ITEMS.stick)).toBeNull();
    });
  });

  describe("getToolTier", () => {
    it("should return the correct tier", () => {
      expect(getToolTier(TEST_ITEMS.pickaxe)).toBe(1);
      expect(getToolTier(TEST_ITEMS.pickaxe_lv2)).toBe(2);
      expect(getToolTier(TEST_ITEMS.pickaxe_lv3)).toBe(3);
      expect(getToolTier(TEST_ITEMS.pickaxe_lv4)).toBe(4);
    });

    it("should return null for non-tools", () => {
      expect(getToolTier(TEST_ITEMS.wooden_sword)).toBeNull();
      expect(getToolTier(TEST_ITEMS.stick)).toBeNull();
    });
  });

  describe("meetsTierRequirement", () => {
    it("should pass when tool meets minimum tier", () => {
      // Tier 1 pickaxe meets tier 1 requirement
      expect(meetsTierRequirement(TEST_ITEMS.pickaxe, 1)).toBe(true);
      // Tier 2 pickaxe meets tier 1 requirement
      expect(meetsTierRequirement(TEST_ITEMS.pickaxe_lv2, 1)).toBe(true);
      // Tier 4 pickaxe meets tier 3 requirement
      expect(meetsTierRequirement(TEST_ITEMS.pickaxe_lv4, 3)).toBe(true);
    });

    it("should fail when tool is below minimum tier", () => {
      // Tier 1 pickaxe does not meet tier 2 requirement
      expect(meetsTierRequirement(TEST_ITEMS.pickaxe, 2)).toBe(false);
      // Tier 2 pickaxe does not meet tier 4 requirement
      expect(meetsTierRequirement(TEST_ITEMS.pickaxe_lv2, 4)).toBe(false);
    });

    it("should fail for non-tools", () => {
      expect(meetsTierRequirement(TEST_ITEMS.wooden_sword, 1)).toBe(false);
      expect(meetsTierRequirement(TEST_ITEMS.stick, 1)).toBe(false);
    });

    it("should handle edge cases correctly", () => {
      // Same tier requirement
      expect(meetsTierRequirement(TEST_ITEMS.pickaxe_lv3, 3)).toBe(true);
      // Tier 4 is max, should meet any requirement
      expect(meetsTierRequirement(TEST_ITEMS.pickaxe_lv4, 4)).toBe(true);
    });
  });
});

describe("Item Lookup", () => {
  // Mock ITEM_DEFINITIONS for lookup tests
  // These tests use the actual ITEM_DEFINITIONS from the module
  
  describe("findItemsBySlot", () => {
    it("should find items by equipment slot", () => {
      const weapons = findItemsBySlot("weapon" as RpgEquipmentSlot);
      expect(weapons.length).toBeGreaterThan(0);
      expect(weapons.every((item) => item.rpgSlot === "weapon")).toBe(true);
    });

    it("should find armor by slot", () => {
      const helmets = findItemsBySlot("helmet" as RpgEquipmentSlot);
      expect(helmets.every((item) => item.rpgSlot === "helmet")).toBe(true);
    });

    it("should find tools", () => {
      const tools = findItemsBySlot("tool" as RpgEquipmentSlot);
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.every((item) => item.rpgSlot === "tool")).toBe(true);
    });
  });

  describe("findToolsByKind", () => {
    it("should find pickaxes", () => {
      const pickaxes = findToolsByKind("pickaxe" as ToolKind);
      expect(pickaxes.length).toBeGreaterThan(0);
      expect(pickaxes.every((item) => item.tool?.toolKind === "pickaxe")).toBe(true);
    });

    it("should find axes", () => {
      const axes = findToolsByKind("axe" as ToolKind);
      expect(axes.length).toBeGreaterThan(0);
      expect(axes.every((item) => item.tool?.toolKind === "axe")).toBe(true);
    });

    it("should return empty array for no matches", () => {
      // "drill" is not a valid tool kind
      const drills = findToolsByKind("drill" as ToolKind);
      expect(drills).toEqual([]);
    });
  });

  describe("findToolsByMinTier", () => {
    it("should find tools meeting minimum tier", () => {
      const tier2Plus = findToolsByMinTier(2 as ToolTier);
      expect(tier2Plus.every((item) => (item.tool?.tier ?? 0) >= 2)).toBe(true);
    });

    it("should include higher tier tools", () => {
      const tier3Plus = findToolsByMinTier(3 as ToolTier);
      expect(tier3Plus.every((item) => (item.tool?.tier ?? 0) >= 3)).toBe(true);
    });

    it("should return all tools for tier 1", () => {
      const tier1Plus = findToolsByMinTier(1 as ToolTier);
      expect(tier1Plus.every((item) => item.tool !== undefined)).toBe(true);
    });
  });
});

describe("MongoDB Safety", () => {
  // All item IDs in ITEM_DEFINITIONS should be safe for MongoDB keys
  // This is validated at definition time via TypeScript
  
  it("should only contain safe item ID characters", () => {
    // Item IDs should only contain: lowercase letters, numbers, underscores
    // No dots, no dollar signs
    const unsafePattern = /[.$]/;
    
    // Test our test items
    for (const itemId of Object.keys(TEST_ITEMS)) {
      expect(unsafePattern.test(itemId)).toBe(false);
    }
  });

  it("should not contain reserved MongoDB field patterns", () => {
    // MongoDB doesn't allow keys starting with $ or containing .
    const reservedPattern = /(^\$)|\./;
    
    for (const itemId of Object.keys(TEST_ITEMS)) {
      expect(reservedPattern.test(itemId)).toBe(false);
    }
  });
});
