export type ItemId = string;

/** RPG equipment slot types. */
export type RpgEquipmentSlot =
  | "weapon"
  | "shield"
  | "helmet"
  | "chest"
  | "pants"
  | "boots"
  | "ring"
  | "necklace"
  | "tool";

/** Tool kinds for gathering. */
export type ToolKind = "pickaxe" | "axe";

/** Tool tier (1-4). */
export type ToolTier = 1 | 2 | 3 | 4;

/** Tool metadata for items that can be used as gathering tools. */
export interface ToolMetadata {
  /** Kind of tool. */
  toolKind: ToolKind;
  /** Tier level (affects gathering locations). */
  tier: ToolTier;
  /** Maximum durability before breaking. */
  maxDurability: number;
}

/** RPG stats for equipment. */
export interface RpgStats {
  /** Attack bonus. */
  atk?: number;
  /** Defense bonus. */
  def?: number;
  /** HP bonus. */
  hp?: number;
}

export type ItemDefinition = {
  id: ItemId;
  name: string;
  description: string;
  emoji?: string;
  maxStack?: number;
  /** Weight contribution to inventory capacity. Default: 1 */
  weight?: number;
  /** Whether this item can stack in inventory. Default: true */
  canStack?: boolean;
  /** Base monetary value. Optional. */
  value?: number;
  /** RPG equipment slot this item occupies when equipped. */
  rpgSlot?: RpgEquipmentSlot;
  /** RPG combat stats provided when equipped. */
  stats?: RpgStats;
  /** Tool metadata for gathering tools. */
  tool?: ToolMetadata;
};

export type InventoryItem = {
  id: ItemId;
  quantity: number;
};

export type ItemUseFunction = (ctx: {
  item: InventoryItem;
  userId: string;
}) => Promise<void>;

export type ItemDefinitionWithUse = ItemDefinition & {
  onUse?: ItemUseFunction;
};

export const DEFAULT_MAX_STACK = 99;
export const DEFAULT_ITEM_WEIGHT = 1;
export const DEFAULT_CAN_STACK = true;

/** Default inventory capacity limits. */
export const DEFAULT_INVENTORY_CAPACITY = {
  /** Maximum total weight. */
  maxWeight: 200,
  /** Maximum distinct item slots. */
  maxSlots: 20,
};

export const ITEM_DEFINITIONS: Record<ItemId, ItemDefinitionWithUse> = {
  stick: {
    id: "stick",
    name: "Wooden Stick",
    description: "An ordinary stick. Maybe it can be used to craft something.",
    emoji: ":wood:",
    maxStack: DEFAULT_MAX_STACK,
    weight: 1,
    canStack: true,
    onUse: async ({ item, userId }) => {
      console.log(`[inventory] User ${userId} used item ${item.id}`);
      // TODO: add real item behavior/persistence hook here.
    },
  },
  sword: {
    id: "sword",
    name: "Iron Sword",
    description: "A basic sword for combat.",
    emoji: ":crossed_swords:",
    maxStack: 1,
    weight: 5,
    canStack: false,
    value: 100,
    rpgSlot: "weapon",
    stats: { atk: 10 },
  },

  // Weapons
  wooden_sword: {
    id: "wooden_sword",
    name: "Wooden Sword",
    description: "A simple training sword.",
    emoji: ":wood:",
    maxStack: 1,
    weight: 2,
    canStack: false,
    value: 10,
    rpgSlot: "weapon",
    stats: { atk: 5 },
  },
  steel_sword: {
    id: "steel_sword",
    name: "Steel Sword",
    description: "A well-crafted steel blade.",
    emoji: ":crossed_swords:",
    maxStack: 1,
    weight: 5,
    canStack: false,
    value: 250,
    rpgSlot: "weapon",
    stats: { atk: 20 },
  },

  // Shields
  wooden_shield: {
    id: "wooden_shield",
    name: "Wooden Shield",
    description: "A basic wooden shield.",
    emoji: ":shield:",
    maxStack: 1,
    weight: 3,
    canStack: false,
    value: 15,
    rpgSlot: "shield",
    stats: { def: 5 },
  },
  iron_shield: {
    id: "iron_shield",
    name: "Iron Shield",
    description: "A sturdy iron shield.",
    emoji: ":shield:",
    maxStack: 1,
    weight: 8,
    canStack: false,
    value: 150,
    rpgSlot: "shield",
    stats: { def: 15 },
  },

  // Helmets
  leather_helmet: {
    id: "leather_helmet",
    name: "Leather Helmet",
    description: "Basic head protection.",
    emoji: ":helmet_with_cross:",
    maxStack: 1,
    weight: 2,
    canStack: false,
    value: 30,
    rpgSlot: "helmet",
    stats: { def: 3 },
  },
  iron_helmet: {
    id: "iron_helmet",
    name: "Iron Helmet",
    description: "Solid head protection.",
    emoji: ":helmet_with_cross:",
    maxStack: 1,
    weight: 5,
    canStack: false,
    value: 120,
    rpgSlot: "helmet",
    stats: { def: 8 },
  },

  // Chest
  leather_armor: {
    id: "leather_armor",
    name: "Leather Armor",
    description: "Light armor made of leather.",
    emoji: ":shirt:",
    maxStack: 1,
    weight: 4,
    canStack: false,
    value: 50,
    rpgSlot: "chest",
    stats: { def: 5, hp: 10 },
  },
  iron_armor: {
    id: "iron_armor",
    name: "Iron Armor",
    description: "Heavy iron plate armor.",
    emoji: ":shield:",
    maxStack: 1,
    weight: 15,
    canStack: false,
    value: 300,
    rpgSlot: "chest",
    stats: { def: 20, hp: 25 },
  },

  // Pants
  leather_pants: {
    id: "leather_pants",
    name: "Leather Pants",
    description: "Leather leg protection.",
    emoji: ":jeans:",
    maxStack: 1,
    weight: 3,
    canStack: false,
    value: 35,
    rpgSlot: "pants",
    stats: { def: 3 },
  },
  iron_pants: {
    id: "iron_pants",
    name: "Iron Greaves",
    description: "Iron leg armor.",
    emoji: ":jeans:",
    maxStack: 1,
    weight: 10,
    canStack: false,
    value: 180,
    rpgSlot: "pants",
    stats: { def: 10 },
  },

  // Boots
  leather_boots: {
    id: "leather_boots",
    name: "Leather Boots",
    description: "Sturdy leather boots.",
    emoji: ":boot:",
    maxStack: 1,
    weight: 2,
    canStack: false,
    value: 20,
    rpgSlot: "boots",
    stats: { def: 2 },
  },
  iron_boots: {
    id: "iron_boots",
    name: "Iron Boots",
    description: "Heavy iron boots.",
    emoji: ":boot:",
    maxStack: 1,
    weight: 6,
    canStack: false,
    value: 100,
    rpgSlot: "boots",
    stats: { def: 5 },
  },

  // Accessories
  health_ring: {
    id: "health_ring",
    name: "Ring of Health",
    description: "A ring that boosts vitality.",
    emoji: ":ring:",
    maxStack: 1,
    weight: 1,
    canStack: false,
    value: 200,
    rpgSlot: "ring",
    stats: { hp: 25 },
  },
  power_ring: {
    id: "power_ring",
    name: "Ring of Power",
    description: "A ring that enhances attacks.",
    emoji: ":ring:",
    maxStack: 1,
    weight: 1,
    canStack: false,
    value: 250,
    rpgSlot: "ring",
    stats: { atk: 5 },
  },
  defense_amulet: {
    id: "defense_amulet",
    name: "Amulet of Defense",
    description: "An amulet that protects the wearer.",
    emoji: ":prayer_beads:",
    maxStack: 1,
    weight: 1,
    canStack: false,
    value: 220,
    rpgSlot: "necklace",
    stats: { def: 8 },
  },

  // Tools - Pickaxes
  pickaxe: {
    id: "pickaxe",
    name: "Pickaxe",
    description: "A basic mining tool.",
    emoji: ":pick:",
    maxStack: 1,
    weight: 5,
    canStack: false,
    value: 50,
    rpgSlot: "tool",
    tool: { toolKind: "pickaxe", tier: 1, maxDurability: 10 },
  },
  pickaxe_lv2: {
    id: "pickaxe_lv2",
    name: "Enhanced Pickaxe",
    description: "An improved mining tool.",
    emoji: ":pick:",
    maxStack: 1,
    weight: 6,
    canStack: false,
    value: 150,
    rpgSlot: "tool",
    tool: { toolKind: "pickaxe", tier: 2, maxDurability: 25 },
  },
  pickaxe_lv3: {
    id: "pickaxe_lv3",
    name: "Advanced Pickaxe",
    description: "A high-quality mining tool.",
    emoji: ":pick:",
    maxStack: 1,
    weight: 7,
    canStack: false,
    value: 350,
    rpgSlot: "tool",
    tool: { toolKind: "pickaxe", tier: 3, maxDurability: 50 },
  },
  pickaxe_lv4: {
    id: "pickaxe_lv4",
    name: "Master Pickaxe",
    description: "A masterwork mining tool.",
    emoji: ":pick:",
    maxStack: 1,
    weight: 8,
    canStack: false,
    value: 800,
    rpgSlot: "tool",
    tool: { toolKind: "pickaxe", tier: 4, maxDurability: 70 },
  },

  // Tools - Axes
  axe: {
    id: "axe",
    name: "Axe",
    description: "A basic woodcutting tool.",
    emoji: ":axe:",
    maxStack: 1,
    weight: 4,
    canStack: false,
    value: 40,
    rpgSlot: "tool",
    tool: { toolKind: "axe", tier: 1, maxDurability: 10 },
  },
  axe_lv2: {
    id: "axe_lv2",
    name: "Enhanced Axe",
    description: "An improved woodcutting tool.",
    emoji: ":axe:",
    maxStack: 1,
    weight: 5,
    canStack: false,
    value: 130,
    rpgSlot: "tool",
    tool: { toolKind: "axe", tier: 2, maxDurability: 25 },
  },
  axe_lv3: {
    id: "axe_lv3",
    name: "Advanced Axe",
    description: "A high-quality woodcutting tool.",
    emoji: ":axe:",
    maxStack: 1,
    weight: 6,
    canStack: false,
    value: 300,
    rpgSlot: "tool",
    tool: { toolKind: "axe", tier: 3, maxDurability: 50 },
  },
  axe_lv4: {
    id: "axe_lv4",
    name: "Master Axe",
    description: "A masterwork woodcutting tool.",
    emoji: ":axe:",
    maxStack: 1,
    weight: 7,
    canStack: false,
    value: 700,
    rpgSlot: "tool",
    tool: { toolKind: "axe", tier: 4, maxDurability: 70 },
  },

  // Materials - Mining (stackable)
  stone: {
    id: "stone",
    name: "Stone",
    description: "Common stone from mining.",
    emoji: ":rock:",
    maxStack: 99,
    weight: 2,
    canStack: true,
    value: 5,
  },
  copper_ore: {
    id: "copper_ore",
    name: "Copper Ore",
    description: "Raw copper ore. Can be processed into ingots.",
    emoji: ":orange_circle:",
    maxStack: 99,
    weight: 3,
    canStack: true,
    value: 15,
  },
  iron_ore: {
    id: "iron_ore",
    name: "Iron Ore",
    description: "Raw iron ore. Can be processed into ingots.",
    emoji: ":brown_circle:",
    maxStack: 99,
    weight: 4,
    canStack: true,
    value: 30,
  },
  silver_ore: {
    id: "silver_ore",
    name: "Silver Ore",
    description: "Raw silver ore. Can be processed into ingots.",
    emoji: ":white_circle:",
    maxStack: 99,
    weight: 4,
    canStack: true,
    value: 50,
  },
  gold_ore: {
    id: "gold_ore",
    name: "Gold Ore",
    description: "Raw gold ore. Can be processed into ingots.",
    emoji: ":yellow_circle:",
    maxStack: 99,
    weight: 5,
    canStack: true,
    value: 100,
  },

  // Materials - Woodcutting (stackable)
  oak_wood: {
    id: "oak_wood",
    name: "Oak Wood",
    description: "Common oak wood from forests.",
    emoji: ":wood:",
    maxStack: 99,
    weight: 2,
    canStack: true,
    value: 5,
  },
  spruce_wood: {
    id: "spruce_wood",
    name: "Spruce Wood",
    description: "Quality spruce wood from cold forests.",
    emoji: ":evergreen_tree:",
    maxStack: 99,
    weight: 2,
    canStack: true,
    value: 15,
  },
  palm_wood: {
    id: "palm_wood",
    name: "Palm Wood",
    description: "Tropical palm wood from warm forests.",
    emoji: ":palm_tree:",
    maxStack: 99,
    weight: 2,
    canStack: true,
    value: 30,
  },
  pine_wood: {
    id: "pine_wood",
    name: "Pine Wood",
    description: "Fine pine wood from mountain forests.",
    emoji: ":christmas_tree:",
    maxStack: 99,
    weight: 2,
    canStack: true,
    value: 50,
  },

  // Processed Materials (stackable)
  copper_ingot: {
    id: "copper_ingot",
    name: "Copper Ingot",
    description: "Processed copper. Used for crafting.",
    emoji: ":orange_square:",
    maxStack: 99,
    weight: 3,
    canStack: true,
    value: 30,
  },
  iron_ingot: {
    id: "iron_ingot",
    name: "Iron Ingot",
    description: "Processed iron. Used for crafting.",
    emoji: ":brown_square:",
    maxStack: 99,
    weight: 4,
    canStack: true,
    value: 60,
  },
  silver_ingot: {
    id: "silver_ingot",
    name: "Silver Ingot",
    description: "Processed silver. Used for crafting.",
    emoji: ":white_large_square:",
    maxStack: 99,
    weight: 4,
    canStack: true,
    value: 100,
  },
  gold_ingot: {
    id: "gold_ingot",
    name: "Gold Ingot",
    description: "Processed gold. Used for crafting.",
    emoji: ":yellow_square:",
    maxStack: 99,
    weight: 5,
    canStack: true,
    value: 200,
  },

  // Processed Wood (planks)
  oak_plank: {
    id: "oak_plank",
    name: "Oak Plank",
    description: "Processed oak wood. Used for crafting.",
    emoji: ":wood:",
    maxStack: 99,
    weight: 1,
    canStack: true,
    value: 12,
  },
  spruce_plank: {
    id: "spruce_plank",
    name: "Spruce Plank",
    description: "Processed spruce wood. Used for crafting.",
    emoji: ":evergreen_tree:",
    maxStack: 99,
    weight: 1,
    canStack: true,
    value: 30,
  },
  palm_plank: {
    id: "palm_plank",
    name: "Palm Plank",
    description: "Processed palm wood. Used for crafting.",
    emoji: ":palm_tree:",
    maxStack: 99,
    weight: 1,
    canStack: true,
    value: 60,
  },
  pine_plank: {
    id: "pine_plank",
    name: "Pine Plank",
    description: "Processed pine wood. Used for crafting.",
    emoji: ":christmas_tree:",
    maxStack: 99,
    weight: 1,
    canStack: true,
    value: 100,
  },
};
