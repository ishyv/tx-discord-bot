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

export function getItemDefinition(
  id: ItemId,
): ItemDefinitionWithUse | null {
  return ITEM_DEFINITIONS[id] ?? null;
}

export function resolveMaxStack(item: ItemDefinitionWithUse): number {
  return item.maxStack ?? DEFAULT_MAX_STACK;
}
