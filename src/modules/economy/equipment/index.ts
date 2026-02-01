/**
 * Equipment Module.
 *
 * Purpose: Manage equipment slots, equipping/unequipping items, and equipment stats.
 */

export { equipmentService } from "./service";
export { equipmentRepo } from "./repository";
export * from "./types";
export {
  getEquipableItemDefinition,
  isEquipableItem,
  getEquipableItemsForSlot,
  listEquipableItemDefinitions,
  getSlotDisplayName,
  SLOT_DISPLAY_NAMES,
  EQUIPABLE_ITEM_DEFINITIONS,
} from "./definitions";
