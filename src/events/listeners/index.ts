/**
 * Auto-register every listener module that lives alongside this index file.
 * Any new `*.ts`/`*.js` file dropped in this directory will be required once
 * at startup, which lets each module perform its side-effect registration
 * (e.g. `client.on("event", handler)`).
 */
import { autoRequireDirectory } from "../autoRequireDirectory";

autoRequireDirectory(__dirname, "listeners");
