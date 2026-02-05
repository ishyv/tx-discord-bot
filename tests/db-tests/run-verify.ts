import { pathToFileURL } from "url";
import path from "path";
import { fileURLToPath } from "url";
import {
    ensureTestEnv,
    connectDb,
    shutdownDb,
} from "./_utils/env";
import { printGlobalSummary, runSuites, type Suite } from "./_utils/runner";

const main = async (): Promise<void> => {
    ensureTestEnv();
    await connectDb();

    try {
        const baseDir = path.dirname(fileURLToPath(import.meta.url));
        const fileUrl = pathToFileURL(path.join(baseDir, "store-admin.int.test.ts")).href;
        const mod = await import(fileUrl);

        if (!mod?.suite) {
            throw new Error(`Missing 'suite' export in store-admin.int.test.ts`);
        }

        const results = await runSuites([mod.suite as Suite]);
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
