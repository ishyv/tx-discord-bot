/**
 * Motivación: proporcionar acceso a definiciones de items y sus propiedades.
 *
 * Idea/concepto: funciones helper para obtener metadatos de items desde el registro central.
 *
 * Alcance: solo lectura de definiciones; no modifica inventory ni maneja transacciones.
 */
import {
  ItemId,
  ItemDefinitionWithUse,
  ITEM_DEFINITIONS,
  DEFAULT_MAX_STACK,
  type RpgEquipmentSlot,
  type ToolKind,
  type ToolTier,
} from "./definitions";
import {
  getContentItemDefinition,
  listContentItemDefinitions,
} from "@/modules/content";

// Re-export types for consumers
export type { ItemDefinitionWithUse } from "./definitions";
export type { RpgEquipmentSlot, ToolKind, ToolTier, RpgStats, ToolMetadata } from "./definitions";

function listResolvedDefinitions(): ItemDefinitionWithUse[] {
  const merged = new Map<string, ItemDefinitionWithUse>();

  for (const [id, item] of Object.entries(ITEM_DEFINITIONS)) {
    merged.set(id, item);
  }

  for (const item of listContentItemDefinitions()) {
    merged.set(item.id, item);
  }

  return Array.from(merged.values());
}

export function getItemDefinition(id: ItemId): ItemDefinitionWithUse | null {
  const contentItem = getContentItemDefinition(id);
  if (contentItem) {
    return contentItem;
  }
  return ITEM_DEFINITIONS[id] ?? null;
}

export function resolveMaxStack(item: ItemDefinitionWithUse): number {
  return item.maxStack ?? DEFAULT_MAX_STACK;
}

/** Get item weight with default fallback. */
export function resolveWeight(item: ItemDefinitionWithUse): number {
  return item.weight ?? 1;
}

/** Check if item can stack. */
export function resolveCanStack(item: ItemDefinitionWithUse): boolean {
  return item.canStack ?? true;
}

/** Calculate total weight for a quantity of an item. */
export function calculateItemWeight(
  item: ItemDefinitionWithUse,
  quantity: number,
): number {
  return resolveWeight(item) * Math.max(0, quantity);
}

// ============================================================================
// RPG Item Helpers
// ============================================================================

/** Check if an item has RPG equipment properties. */
export function isRpgItem(item: ItemDefinitionWithUse): boolean {
  return item.rpgSlot !== undefined || item.stats !== undefined;
}

/** Check if an item is a weapon. */
export function isWeapon(item: ItemDefinitionWithUse): boolean {
  return item.rpgSlot === "weapon";
}

/** Check if an item is armor (helmet, chest, pants, boots, shield). */
export function isArmor(item: ItemDefinitionWithUse): boolean {
  return item.rpgSlot !== undefined &&
    ["helmet", "chest", "pants", "boots", "shield"].includes(item.rpgSlot);
}

/** Check if an item is an accessory (ring, necklace). */
export function isAccessory(item: ItemDefinitionWithUse): boolean {
  return item.rpgSlot === "ring" || item.rpgSlot === "necklace";
}

/** Check if an item is a tool. */
export function isTool(item: ItemDefinitionWithUse): boolean {
  return item.rpgSlot === "tool" && item.tool !== undefined;
}

/** Get the RPG equipment slot for an item. */
export function getItemSlot(
  item: ItemDefinitionWithUse,
): RpgEquipmentSlot | null {
  return item.rpgSlot ?? null;
}

/** Check if an item can be equipped in a specific slot. */
export function canEquipInSlot(
  item: ItemDefinitionWithUse,
  slot: RpgEquipmentSlot,
): boolean {
  return item.rpgSlot === slot;
}

/** Get the attack value of an item. */
export function getAttack(item: ItemDefinitionWithUse): number {
  return item.stats?.atk ?? 0;
}

/** Get the defense value of an item. */
export function getDefense(item: ItemDefinitionWithUse): number {
  return item.stats?.def ?? 0;
}

/** Get the HP bonus of an item. */
export function getHpBonus(item: ItemDefinitionWithUse): number {
  return item.stats?.hp ?? 0;
}

/** Get tool metadata for an item. Returns null if not a tool. */
export function getToolMetadata(
  item: ItemDefinitionWithUse,
): { toolKind: ToolKind; tier: ToolTier; maxDurability: number } | null {
  return item.tool ?? null;
}

/** Get the tool kind for an item. Returns null if not a tool. */
export function getToolKind(item: ItemDefinitionWithUse): ToolKind | null {
  return item.tool?.toolKind ?? null;
}

/** Get the tool tier for an item. Returns null if not a tool. */
export function getToolTier(item: ItemDefinitionWithUse): ToolTier | null {
  return item.tool?.tier ?? null;
}

/** Get the max durability for a tool item. Returns null if not a tool. */
export function getToolMaxDurability(item: ItemDefinitionWithUse): number | null {
  return item.tool?.maxDurability ?? null;
}

/** Check if a tool is of a specific kind. */
export function isToolKind(
  item: ItemDefinitionWithUse,
  kind: ToolKind,
): boolean {
  return item.tool?.toolKind === kind;
}

/** Check if a tool meets a minimum tier requirement. */
export function meetsTierRequirement(
  item: ItemDefinitionWithUse,
  requiredTier: ToolTier,
): boolean {
  if (!item.tool) return false;
  return item.tool.tier >= requiredTier;
}

/** Find all items that fit a specific slot. */
export function findItemsBySlot(
  slot: RpgEquipmentSlot,
): ItemDefinitionWithUse[] {
  return listResolvedDefinitions().filter((def) => def.rpgSlot === slot);
}

/** Find all items of a specific tool kind. */
export function findToolsByKind(kind: ToolKind): ItemDefinitionWithUse[] {
  return listResolvedDefinitions().filter(
    (def) => def.tool?.toolKind === kind,
  );
}

/** Find all items meeting a minimum tier. */
export function findToolsByMinTier(minTier: ToolTier): ItemDefinitionWithUse[] {
  return listResolvedDefinitions().filter(
    (def) => def.tool && def.tool.tier >= minTier,
  );
}

/** Get the category of an item. */
export function getItemCategory(item: ItemDefinitionWithUse): "gear" | "tools" | "materials" | "quest" {
  if (isTool(item)) return "tools";
  // RPG items that are not tools generally fall into gear
  if (isRpgItem(item)) return "gear";

  // Heuristic: If it has value, it's a material/commodity.
  // If no value and no stats, likely a quest item or special item.
  if (item.value !== undefined && item.value > 0) return "materials";

  return "quest"; // Default fallback for special/non-valued items
}
