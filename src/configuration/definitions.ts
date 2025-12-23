/**
 * Config registry and typing contract for per-guild configuration.
 *
 * Role in system:
 * - Central runtime registry used by ConfigStore and providers.
 * - Each config key is paired with a Zod schema and (optionally) a storage path.
 *
 * Key invariants:
 * - A ConfigKey should be registered once; if registered twice, last write wins.
 * - A missing schema means "no validation" and ConfigStore will return {}.
 * - A missing path means "not persisted" for Mongo-backed providers.
 *
 * Gotchas:
 * - Registration is side-effectful; modules must be imported to participate.
 * - Paths are not validated here; if they diverge from the DB shape, reads/writes
 *   will silently fall back to defaults.
 */
import { z, ZodSchema } from "zod";
import { ConfigurableModule } from "./constants";

export { z };

// biome-ignore lint/suspicious/noEmptyInterface: Interface enables module augmentation per feature configs.
export interface ConfigDefinitions {
    // To be extended by module augmentations
}

// We rely on the Enum values being the specific keys, or we can just use string keys for the map
// but typed access is preferred.
export type ConfigKey = ConfigurableModule;
export type ConfigOf<K extends ConfigKey> = K extends keyof ConfigDefinitions ? ConfigDefinitions[K] : never;

export type ConfigDefinition<K extends ConfigKey = ConfigKey> = {
    key: K;
    schema: ZodSchema<any>;
    path?: string;
};

// Registry to hold the runtime schema definitions and storage paths.
// WHY: keep schemas close to their domain modules without a centralized map.
// RISK: duplicate registrations override earlier schemas/paths.
const registry = new Map<string, ConfigDefinition>();

/**
 * Register a config key with its schema and optional storage path.
 *
 * @param key Stable ConfigurableModule value.
 * @param schema Zod schema that applies defaults and validation.
 * @param options.path Dot-path inside the guild document (Mongo provider).
 * @returns The same schema for type inference at the call site.
 * @sideEffects Mutates the global registry.
 * @invariant The key must be unique to avoid overriding another schema/path.
 */
export function defineConfig<K extends ConfigKey>(
    key: K,
    schema: ZodSchema<any>,
    options: { path?: string } = {},
) {
    registry.set(key, { key, schema, path: options.path });
    return schema;
}

/**
 * Lookup a schema by key.
 *
 * @returns The Zod schema or undefined when the key was not registered.
 * @sideEffects None.
 */
export function getSchema<K extends ConfigKey>(key: K) {
    return registry.get(key)?.schema;
}

/**
 * Lookup the full config definition (schema + path).
 *
 * @returns The definition or undefined if the key was never registered.
 * @sideEffects None.
 */
export function getConfigDefinition<K extends ConfigKey>(
    key: K,
): ConfigDefinition<K> | undefined {
    return registry.get(key) as ConfigDefinition<K> | undefined;
}

/**
 * Resolve the storage path for a key, if registered.
 *
 * @returns Dot-notation path or undefined.
 * @sideEffects None.
 */
export function getConfigPath<K extends ConfigKey>(key: K): string | undefined {
    return registry.get(key)?.path;
}
