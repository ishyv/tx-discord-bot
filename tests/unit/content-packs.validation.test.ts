import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { loadContentPacks, ContentLoadError } from "@/modules/content/loader";
import {
  validateLoadedContent,
  ContentValidationError,
} from "@/modules/content/validation";

const tempDirs: string[] = [];

async function createTempPackDir(files: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pyebot-content-"));
  tempDirs.push(dir);

  for (const [fileName, content] of Object.entries(files)) {
    const target = path.join(dir, fileName);
    await writeFile(target, JSON.stringify(content, null, 2), "utf8");
  }

  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) =>
      rm(dir, { recursive: true, force: true }),
    ),
  );
});

describe("content pack validation", () => {
  it("returns actionable schema errors with file and json path", async () => {
    const packDir = await createTempPackDir({
      "rpg.materials.json": {
        schemaVersion: 1,
        items: [
          {
            id: "Bad-ID",
            name: "Invalid Item",
            description: "Invalid id format",
            canStack: true,
          },
        ],
      },
      "rpg.craftables.json": { schemaVersion: 1, items: [] },
      "rpg.recipes.json": { schemaVersion: 1, recipes: [] },
      "rpg.drop_tables.json": { schemaVersion: 1, dropTables: [] },
      "rpg.locations.json": { schemaVersion: 1, locations: [] },
    });

    let thrown: unknown = null;
    try {
      await loadContentPacks(packDir);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ContentLoadError);
    const details = (thrown as ContentLoadError).details.join("\n");
    expect(details).toContain("rpg.materials.json");
    expect(details).toContain("$.items[0].id");
    expect(details).toContain("^[a-z0-9_]+$");
  });

  it("catches unknown item references in recipes during cross-reference validation", async () => {
    const packDir = await createTempPackDir({
      "rpg.materials.json": {
        schemaVersion: 1,
        items: [
          {
            id: "known_mat",
            name: "Known Material",
            description: "valid material",
            canStack: true,
            maxStack: 99,
          },
        ],
      },
      "rpg.craftables.json": { schemaVersion: 1, items: [] },
      "rpg.recipes.json": {
        schemaVersion: 1,
        recipes: [
          {
            id: "bad_recipe",
            name: "Bad Recipe",
            description: "references unknown item",
            type: "crafting",
            itemInputs: [{ itemId: "unknown_mat", quantity: 1 }],
            itemOutputs: [{ itemId: "known_mat", quantity: 1 }],
            xpReward: 1,
            enabled: true,
          },
        ],
      },
      "rpg.drop_tables.json": { schemaVersion: 1, dropTables: [] },
      "rpg.locations.json": { schemaVersion: 1, locations: [] },
    });

    const loaded = await loadContentPacks(packDir);

    let thrown: unknown = null;
    try {
      validateLoadedContent(loaded);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ContentValidationError);
    const details = (thrown as ContentValidationError).details.join("\n");
    expect(details).toContain("unknown item 'unknown_mat'");
    expect(details).toContain("$.itemInputs[0].itemId");
    expect(details).toContain("rpg.recipes.json");
  });
});
