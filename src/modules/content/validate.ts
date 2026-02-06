import { loadContentRegistryOrThrow, getContentRegistry } from "./registry";

async function main(): Promise<void> {
  try {
    await loadContentRegistryOrThrow();
    const registry = getContentRegistry();
    const items = registry?.listItems().length ?? 0;
    const recipes = registry?.listRecipes().length ?? 0;
    const locations = registry?.getLocations().length ?? 0;

    console.log(
      `[content] OK: ${items} items, ${recipes} recipes, ${locations} locations`,
    );
    process.exit(0);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[content] Validation failed: ${reason}`);

    if (error instanceof Error && "details" in error) {
      const details = (error as { details?: unknown }).details;
      if (Array.isArray(details)) {
        for (const detail of details) {
          console.error(` - ${String(detail)}`);
        }
      }
    }

    process.exit(1);
  }
}

void main();
