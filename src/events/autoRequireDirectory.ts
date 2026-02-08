import { readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";

/**
 * Auto-import all modules in a directory via side-effect `require`.
 * Skips directories, `index.*`, and `.d.ts` files.
 *
 * @param directory Absolute path to the directory to scan.
 * @param label Label used in error logs (e.g. "events", "listeners").
 */
export function autoRequireDirectory(directory: string, label: string): void {
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) continue;

    const extension = extname(entry);
    if (!extension || (extension !== ".ts" && extension !== ".js")) continue;

    const fileName = basename(entry);
    if (fileName.startsWith("index.")) continue;
    if (fileName.endsWith(".d.ts")) continue;

    try {
      require(fullPath);
    } catch (error) {
      console.error(`[${label}] Failed to load ${fileName}:`, error);
    }
  }
}
