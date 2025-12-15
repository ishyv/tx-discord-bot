
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

// Registry to hold the runtime schema definitions
// We store Zod schemas now
const registry = new Map<string, ZodSchema<any>>();

export function defineConfig<K extends ConfigKey>(key: K, schema: ZodSchema<any>) {
    registry.set(key, schema);
    return schema;
}

export function getSchema<K extends ConfigKey>(key: K) {
    return registry.get(key);
}
