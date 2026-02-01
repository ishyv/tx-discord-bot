export type ItemId = string;

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
  },
};
