import { readdir } from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { ensureTestEnv, connectDb, shutdownDb, getNamespace, getSeed } from "./_utils/env";
import { printGlobalSummary, runSuites, type Suite } from "./_utils/runner";

const TEST_SUFFIX = ".int.test.ts";

const loadSuites = async (): Promise<Suite[]> => {
  const baseDir = path.dirname(fileURLToPath(import.meta.url));
  const entries = await readdir(baseDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(TEST_SUFFIX))
    .map((entry) => entry.name)
    .sort();

  const suites: Suite[] = [];

  for (const file of files) {
    const fileUrl = pathToFileURL(path.join(baseDir, file)).href;
    const mod = await import(fileUrl);
    if (!mod?.suite) {
      throw new Error(`Missing 'suite' export in ${file}`);
    }
    suites.push(mod.suite as Suite);
  }

  return suites;
};

const main = async (): Promise<void> => {
  ensureTestEnv();
  console.log(
    `DB tests using namespace '${getNamespace()}' (seed='${getSeed()}')`,
  );

  await connectDb();

  try {
    const suites = await loadSuites();
    const results = await runSuites(suites);
    printGlobalSummary(results);

    if (results.some((result) => result.failed > 0)) {
      process.exitCode = 1;
    }
  } finally {
    await shutdownDb();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
