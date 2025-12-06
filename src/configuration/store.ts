
import { ConfigKey, ConfigOf, getSchema } from "./definitions";
import { ConfigProvider, MongoGuildConfigProvider } from "./provider";

export class ConfigStore {
    constructor(private provider: ConfigProvider) { }

    async get<K extends ConfigKey>(guildId: string, key: K): Promise<ConfigOf<K>> {
        const schema = getSchema(key);
        if (!schema) {
            throw new Error(`Config key '${key}' is not defined. Use defineConfig first.`);
        }

        const rawConfig = await this.provider.getConfig<ConfigOf<K>>(guildId, key);

        // Zod handles defaults and coercions
        // We treat the raw config as "input" to the schema
        // If rawConfig is {}, zod uses defaults.
        const result = schema.parse(rawConfig);

        return result;
    }

    async set<K extends ConfigKey>(guildId: string, key: K, partial: Partial<ConfigOf<K>>): Promise<void> {
        const schema = getSchema(key);
        if (!schema) {
            throw new Error(`Config key '${key}' is not defined.`);
        }

        // validate that the partial update results in a consistent state
        // 1. Get current valid state (with defaults)
        const current = await this.get(guildId, key);

        // 2. Merge updates
        const merged = { ...current, ...partial };

        // 3. Validate the final state
        // This catches issues like "min > max" if the schema has refinements
        const validation = schema.safeParse(merged);

        if (!validation.success) {
            throw new Error(`Invalid configuration update for ${key}: ${validation.error.message}`);
        }

        // 4. Save only the changes
        await this.provider.setConfig(guildId, key, partial);
    }
}

// Global instance
export const configStore = new ConfigStore(new MongoGuildConfigProvider());
