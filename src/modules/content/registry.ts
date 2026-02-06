import type { ItemDefinitionWithUse } from "@/modules/inventory/definitions";
import {
  DEFAULT_CONTENT_PACKS_DIR,
  loadContentPacks,
  type LoadedContentPacks,
  type SourcedDropTableDef,
  type SourcedItemDef,
  type SourcedLocationDef,
  type SourcedRecipeDef,
} from "./loader";
import {
  validateLoadedContent,
  ContentValidationError,
} from "./validation";
import type { GatherAction, Profession } from "./schemas";

export interface DropQueryOptions {
  readonly profession?: Profession;
  readonly locationId?: string;
  readonly toolTier?: number;
}

export type ContentDropEntry = {
  readonly tableId: string;
  readonly action: GatherAction;
  readonly profession?: Profession;
  readonly tier: number;
  readonly locationId?: string;
  readonly itemId: string;
  readonly chance: number;
  readonly weight: number;
  readonly minQty: number;
  readonly maxQty: number;
  readonly minToolTier?: number;
  readonly __source: { file: string; jsonPath: string };
};

export interface ContentRegistry {
  readonly loadedFrom: string;
  getItem(id: string): SourcedItemDef | null;
  listItems(): readonly SourcedItemDef[];
  getRecipe(id: string): SourcedRecipeDef | null;
  listRecipes(): readonly SourcedRecipeDef[];
  listRecipesByType(type: "crafting" | "processing"): readonly SourcedRecipeDef[];
  findProcessingRecipeByInput(itemId: string): SourcedRecipeDef | null;
  getDrops(
    action: GatherAction,
    tier: number,
    options?: DropQueryOptions,
  ): readonly ContentDropEntry[];
  getLocationById(id: string): SourcedLocationDef | null;
  getLocations(profession?: Profession): readonly SourcedLocationDef[];
}

class RuntimeContentRegistry implements ContentRegistry {
  readonly loadedFrom: string;
  private readonly itemsById: Map<string, SourcedItemDef>;
  private readonly recipesById: Map<string, SourcedRecipeDef>;
  private readonly locationsById: Map<string, SourcedLocationDef>;
  private readonly locations: readonly SourcedLocationDef[];
  private readonly dropTablesByActionTier: Map<string, readonly SourcedDropTableDef[]>;
  private readonly processingByInputItemId: Map<string, SourcedRecipeDef>;

  constructor(packs: LoadedContentPacks) {
    this.loadedFrom = packs.packDir;

    this.itemsById = new Map(packs.items.map((item) => [item.id, item]));
    this.recipesById = new Map(packs.recipes.map((recipe) => [recipe.id, recipe]));
    this.locationsById = new Map(
      packs.locations.map((location) => [location.id, location]),
    );
    this.locations = packs.locations.slice().sort((a, b) =>
      a.requiredTier - b.requiredTier,
    );

    const grouped = new Map<string, SourcedDropTableDef[]>();
    for (const dropTable of packs.dropTables) {
      const key = this.buildActionTierKey(dropTable.action, dropTable.tier);
      const current = grouped.get(key) ?? [];
      current.push(dropTable);
      grouped.set(key, current);
    }
    this.dropTablesByActionTier = grouped;

    this.processingByInputItemId = this.indexProcessingRecipes(packs.recipes);
  }

  getItem(id: string): SourcedItemDef | null {
    return this.itemsById.get(id) ?? null;
  }

  listItems(): readonly SourcedItemDef[] {
    return Array.from(this.itemsById.values());
  }

  getRecipe(id: string): SourcedRecipeDef | null {
    return this.recipesById.get(id) ?? null;
  }

  listRecipes(): readonly SourcedRecipeDef[] {
    return Array.from(this.recipesById.values());
  }

  listRecipesByType(type: "crafting" | "processing"): readonly SourcedRecipeDef[] {
    return this.listRecipes().filter((recipe) => recipe.type === type);
  }

  findProcessingRecipeByInput(itemId: string): SourcedRecipeDef | null {
    return this.processingByInputItemId.get(itemId) ?? null;
  }

  getDrops(
    action: GatherAction,
    tier: number,
    options?: DropQueryOptions,
  ): readonly ContentDropEntry[] {
    const key = this.buildActionTierKey(action, tier);
    const tables = this.dropTablesByActionTier.get(key) ?? [];
    const result: ContentDropEntry[] = [];

    for (const table of tables) {
      if (options?.profession && table.profession && table.profession !== options.profession) {
        continue;
      }

      if (options?.locationId && table.locationId && table.locationId !== options.locationId) {
        continue;
      }

      table.entries.forEach((entry, index) => {
        if (
          options?.toolTier !== undefined &&
          entry.minToolTier !== undefined &&
          options.toolTier < entry.minToolTier
        ) {
          return;
        }

        result.push({
          tableId: table.id,
          action: table.action,
          profession: table.profession,
          tier: table.tier,
          locationId: table.locationId,
          itemId: entry.itemId,
          chance: entry.chance,
          weight: entry.weight,
          minQty: entry.minQty,
          maxQty: entry.maxQty ?? entry.minQty,
          minToolTier: entry.minToolTier,
          __source: {
            file: table.__source.file,
            jsonPath: `${table.__source.jsonPath}.entries[${index}]`,
          },
        });
      });
    }

    return result;
  }

  getLocationById(id: string): SourcedLocationDef | null {
    return this.locationsById.get(id) ?? null;
  }

  getLocations(profession?: Profession): readonly SourcedLocationDef[] {
    if (!profession) {
      return this.locations;
    }
    return this.locations.filter((location) => location.profession === profession);
  }

  private buildActionTierKey(action: GatherAction, tier: number): string {
    return `${action}:${tier}`;
  }

  private indexProcessingRecipes(
    recipes: readonly SourcedRecipeDef[],
  ): Map<string, SourcedRecipeDef> {
    const index = new Map<string, SourcedRecipeDef>();
    const issues: string[] = [];

    for (const recipe of recipes) {
      if (recipe.type !== "processing") {
        continue;
      }

      const input = recipe.itemInputs[0];
      if (!input) {
        continue;
      }

      const existing = index.get(input.itemId);
      if (existing) {
        issues.push(
          `Duplicate processing recipe input '${input.itemId}' in ${existing.__source.file} ${existing.__source.jsonPath} and ${recipe.__source.file} ${recipe.__source.jsonPath}`,
        );
        continue;
      }

      index.set(input.itemId, recipe);
    }

    if (issues.length > 0) {
      throw new ContentValidationError("Invalid processing recipe index", issues);
    }

    return index;
  }
}

let cachedRegistry: ContentRegistry | null = null;
let cachedDir: string | null = null;

export async function loadContentRegistry(
  packDir: string = DEFAULT_CONTENT_PACKS_DIR,
  options?: { forceReload?: boolean },
): Promise<ContentRegistry> {
  if (
    !options?.forceReload &&
    cachedRegistry &&
    cachedDir === packDir
  ) {
    return cachedRegistry;
  }

  const packs = await loadContentPacks(packDir);
  validateLoadedContent(packs);
  const registry = new RuntimeContentRegistry(packs);
  cachedRegistry = registry;
  cachedDir = packDir;
  return registry;
}

export async function loadContentRegistryOrThrow(): Promise<ContentRegistry> {
  return loadContentRegistry(DEFAULT_CONTENT_PACKS_DIR, { forceReload: true });
}

export function getContentRegistry(): ContentRegistry | null {
  return cachedRegistry;
}

export function resetContentRegistryForTests(): void {
  cachedRegistry = null;
  cachedDir = null;
}

function toInventoryItemDefinition(item: SourcedItemDef): ItemDefinitionWithUse {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    emoji: item.emoji,
    maxStack: item.maxStack,
    weight: item.weight,
    canStack: item.canStack,
    value: item.value,
    rpgSlot: item.rpgSlot,
    stats: item.stats,
    tool: item.tool ? { ...item.tool, tier: item.tool.tier as 1 | 2 | 3 | 4 } : undefined,
    market: item.market,
  };
}

export function getContentItemDefinition(id: string): ItemDefinitionWithUse | null {
  const registry = getContentRegistry();
  if (!registry) {
    return null;
  }
  const item = registry.getItem(id);
  return item ? toInventoryItemDefinition(item) : null;
}

export function listContentItemDefinitions(): readonly ItemDefinitionWithUse[] {
  const registry = getContentRegistry();
  if (!registry) {
    return [];
  }
  return registry.listItems().map((item) => toInventoryItemDefinition(item));
}
