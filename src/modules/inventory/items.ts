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
} from "./definitions";

// Re-export types for consumers
export type { ItemDefinitionWithUse } from "./definitions";

export function getItemDefinition(id: ItemId): ItemDefinitionWithUse | null {
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
