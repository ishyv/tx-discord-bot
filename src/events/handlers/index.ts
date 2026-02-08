/**
 * Auto-import all Seyfert event modules located in this directory.
 * Each file is expected to default-export the result of `createEvent(...)`.
 */
import { autoRequireDirectory } from "../autoRequireDirectory";

autoRequireDirectory(__dirname, "events");
