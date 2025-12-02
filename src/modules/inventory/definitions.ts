export type ItemId = string;

export type ItemDefinition = {
    id: ItemId;
    name: string;
    description: string;
    emoji?: string;
    maxStack?: number;
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

export const ITEM_DEFINITIONS: Record<ItemId, ItemDefinitionWithUse> = {
    palo: {
        id: "palo",
        name: "Palo de Madera",
        description: "Un palo comun y corriente. Tal vez sirva para craftear algo.",
        emoji: ":wood:",
        maxStack: DEFAULT_MAX_STACK,
        onUse: async ({ item, userId }) => {
            console.log(`[inventory] Usuario ${userId} uso el item ${item.id}`);
            // TODO: add real item behavior/persistence hook here.
        },
    },
};
