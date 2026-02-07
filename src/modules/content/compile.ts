import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadContentRegistryOrThrow } from "./registry";

interface CompiledContentRegistry {
  readonly generatedAt: string;
  readonly loadedFrom: string;
  readonly items: Array<{
    id: string;
    name: string;
    category?: string;
  }>;
  readonly recipes: Array<{
    id: string;
    name: string;
    type: "crafting" | "processing";
  }>;
  readonly locations: Array<{
    id: string;
    name: string;
    action: "mine" | "forest";
    requiredTier: number;
    profession: "miner" | "lumber";
  }>;
}

async function main(): Promise<void> {
  const registry = await loadContentRegistryOrThrow();

  const payload: CompiledContentRegistry = {
    generatedAt: new Date().toISOString(),
    loadedFrom: registry.loadedFrom,
    items: registry
      .listItems()
      .map((item) => ({
        id: item.id,
        name: item.name,
        category: item.market?.category,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    recipes: registry
      .listRecipes()
      .map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        type: recipe.type,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    locations: registry
      .getLocations()
      .map((location) => ({
        id: location.id,
        name: location.name,
        action: location.action,
        requiredTier: location.requiredTier,
        profession: location.profession,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };

  const outputDir = path.resolve(process.cwd(), "generated");
  const outputPath = path.join(outputDir, "content-registry.json");

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(
    `[content] Compiled registry -> ${outputPath} (${payload.items.length} items, ${payload.recipes.length} recipes)`,
  );
}

main().catch((error) => {
  console.error("[content] Failed to compile registry:", error);
  process.exit(1);
});
