/**
 * Configuration entrypoint.
 *
 * Role in system:
 * - Ensures config schemas are registered via side-effect import.
 * - Re-exports the public config API (store, definitions, constants).
 *
 * Gotchas:
 * - Importing submodules directly (e.g., "./store") bypasses registration.
 *   Prefer `import { configStore } from "@/configuration"`.
 */
import "./register";

export * from "./definitions";
export * from "./provider";
export * from "./store";
export * from "./constants";
