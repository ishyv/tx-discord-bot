
import { ConfigKey, ConfigOf, getSchema } from "./definitions";
import { ConfigProvider, MongoGuildConfigProvider } from "./provider";
import { deepClone } from "@/db/helpers";

const CACHE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 2_000;

export class ConfigStore {
    constructor(private provider: ConfigProvider) { }

    private readonly cache = new Map<string, { expiresAt: number; value: unknown }>();

    private cacheKey(guildId: string, key: string): string {
        return `${guildId}:${key}`;
    }

    private readCache<K extends ConfigKey>(guildId: string, key: K): ConfigOf<K> | null {
        const entry = this.cache.get(this.cacheKey(guildId, key));
        if (!entry) return null;

        if (entry.expiresAt < Date.now()) {
            this.cache.delete(this.cacheKey(guildId, key));
            return null;
        }

        return deepClone(entry.value as ConfigOf<K>);
    }

    private writeCache<K extends ConfigKey>(
        guildId: string,
        key: K,
        value: ConfigOf<K>,
    ): void {
        this.cache.set(this.cacheKey(guildId, key), {
            expiresAt: Date.now() + CACHE_TTL_MS,
            value: deepClone(value),
        });

        if (this.cache.size <= MAX_CACHE_ENTRIES) return;
        const overflow = this.cache.size - MAX_CACHE_ENTRIES;
        for (let i = 0; i < overflow; i += 1) {
            const oldestKey = this.cache.keys().next().value as string | undefined;
            if (!oldestKey) break;
            this.cache.delete(oldestKey);
        }
    }

    async get<K extends ConfigKey>(guildId: string, key: K): Promise<ConfigOf<K>> {
        const cached = this.readCache(guildId, key);
        if (cached !== null) return cached;

        const schema = getSchema(key);
        if (!schema) {
            throw new Error(`Config key '${key}' is not defined. Use defineConfig first.`);
        }

        const rawConfig = await this.provider.getConfig<ConfigOf<K>>(guildId, key);

        // Zod handles defaults and coercions
        // We treat the raw config as "input" to the schema
        // If rawConfig is {}, zod uses defaults.
        const result = schema.parse(rawConfig);

        this.writeCache(guildId, key, result);
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

        // 5. Keep in-memory cache coherent (avoid an extra DB roundtrip on hot paths).
        const applied = { ...(current as any) } as any;
        for (const [subKey, value] of Object.entries(partial)) {
            if (value === undefined) continue;
            applied[subKey] = value;
        }

        this.writeCache(guildId, key, applied);
    }
}

// Global instance
export const configStore = new ConfigStore(new MongoGuildConfigProvider());
