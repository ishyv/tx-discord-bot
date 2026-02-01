/**
 * Perk registry helpers.
 */

import type { PerkDefinition, PerkId } from "./types";
import { PERK_DEFINITIONS } from "./definitions";

const PERK_MAP: Record<PerkId, PerkDefinition> = Object.freeze(
  PERK_DEFINITIONS.reduce(
    (acc, perk) => {
      acc[perk.id] = perk;
      return acc;
    },
    {} as Record<PerkId, PerkDefinition>,
  ),
);

export const listPerkDefinitions = (): PerkDefinition[] =>
  PERK_DEFINITIONS.slice();

export const getPerkDefinition = (perkId: PerkId): PerkDefinition | null =>
  PERK_MAP[perkId] ?? null;
