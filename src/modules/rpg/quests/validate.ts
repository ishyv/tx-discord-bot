import {
  loadQuestPacks,
  validateLoadedQuestPacks,
} from "./registry";

async function main(): Promise<void> {
  try {
    const loaded = await loadQuestPacks();
    await validateLoadedQuestPacks(loaded);

    console.log(
      `[quests] OK: ${loaded.quests.length} quests, ${loaded.questlines.length} questlines`,
    );
    process.exit(0);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[quests] Validation failed: ${reason}`);

    if (error && typeof error === "object" && "details" in error) {
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
