import {
    ensureTestEnv,
    connectDb,
    shutdownDb,
    getNamespace,
    getSeed,
} from "./_utils/env";
import { runSuites } from "./_utils/runner";
import { suite } from "./hybrid-work-payout.int.test";

const main = async (): Promise<void> => {
    ensureTestEnv();
    console.log(
        `Running single suite using namespace '${getNamespace()}' (seed='${getSeed()}')`,
    );

    await connectDb();

    try {
        const results = await runSuites([suite]);
        console.log(JSON.stringify(results, null, 2));
    } finally {
        await shutdownDb();
    }
};

main().catch(console.error);
