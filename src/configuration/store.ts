/**
 * Config store with validation, defaults, and in-memory caching.
 *
 * Role in system:
 * - Normalizes per-guild config using Zod schemas.
 * - Provides a stable API (`get`/`set`) for all modules.
 *
 * Dependencies:
 * - `ConfigProvider` for persistence (Mongo).
 * - `defineConfig` registry for schema + path resolution.
 *
 * Invariants:
 * - No throws: failures log and fall back to defaults.
 * - Cache is best-effort (TTL + max entries, not LRU).
 *
 * Gotchas:
 * - If a key is not registered, `get` returns `{}` and `set` no-ops.
 * - Fallback data is cached; changes in schemas require process restart.
 *
 * Cache Invalidation Strategy
 * ===========================
 *
 * TTL-based: Each cache entry expires after 30 seconds (CACHE_TTL_MS).
 *
 * Invalidation scenarios:
 * 1. **Automatic (TTL)**: Entry expires, next `get()` fetches from DB.
 * 2. **Write-through**: On `set()`, cache is updated immediately.
 * 3. **Overflow eviction**: When > 2000 entries, oldest are removed (FIFO, not LRU).
 *
 * Known limitations:
 * - No cross-process invalidation (each process has its own cache).
 * - No manual `invalidate(guildId, key)` method exposed.
 * - Stale reads possible for up to 30s after external DB changes.
 *
 * When to use manual invalidation (not currently supported):
 * - Admin console makes direct DB changes
 * - Migration scripts update configs
 *
 * @see CACHE_TTL_MS for TTL duration
 * @see MAX_CACHE_ENTRIES for cache size limit
 */

import { ConfigKey, ConfigOf, getSchema } from "./definitions";
import { MongoGuildConfigProvider } from "./provider";
import { deepClone } from "@/db/helpers";

const CACHE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 2_000;

/**
 * Runtime config access with caching and validation.
 */
export class ConfigStore {
  constructor(private provider: MongoGuildConfigProvider) {}

  private readonly cache = new Map<
    string,
    { expiresAt: number; value: unknown }
  >();

  private cacheKey(guildId: string, key: string): string {
    return `${guildId}:${key}`;
  }

  private readCache<K extends ConfigKey>(
    guildId: string,
    key: K,
  ): ConfigOf<K> | null {
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

    // WHY: bounded cache prevents unbounded memory growth in large bots.
    // RISK: oldest eviction is not LRU; hot entries might be evicted under load.
    if (this.cache.size <= MAX_CACHE_ENTRIES) return;
    const overflow = this.cache.size - MAX_CACHE_ENTRIES;
    for (let i = 0; i < overflow; i += 1) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Read a config slice with schema defaults applied.
   *
   * @param guildId Guild identifier.
   * @param key Config key registered in the registry.
   * @returns The normalized config (defaults applied).
   * @sideEffects Reads from provider and updates the in-memory cache.
   * @errors None thrown; failures log and return defaults/empty.
   */
  async get<K extends ConfigKey>(
    guildId: string,
    key: K,
  ): Promise<ConfigOf<K>> {
    const cached = this.readCache(guildId, key);
    if (cached !== null) return cached;

    const schema = getSchema(key);
    if (!schema) {
      console.warn(
        `[config] Config key '${key}' has no schema registered. Returning empty config.`,
      );
      return {} as ConfigOf<K>;
    }

    let rawConfig: Partial<ConfigOf<K>> = {};
    try {
      rawConfig = await this.provider.getConfig<ConfigOf<K>>(guildId, key);
    } catch (error) {
      console.warn("[config] Failed to read config. Using defaults.", {
        guildId,
        key,
        error,
      });
    }

    const parsed = schema.safeParse(rawConfig);
    if (parsed.success) {
      this.writeCache(guildId, key, parsed.data);
      return parsed.data as ConfigOf<K>;
    }

    console.warn(
      `[config] Failed to parse config for key '${key}'. Using defaults.`,
      parsed.error,
    );

    // WHY: prefer schema defaults over throwing to keep runtime stable.
    // RISK: silently masking malformed data; logs are the only signal.
    const fallback = schema.safeParse({});
    const value = fallback.success ? fallback.data : (rawConfig as ConfigOf<K>);

    this.writeCache(guildId, key, value);
    return value;
  }

  /**
   * Persist a partial config update, validating the final state.
   *
   * @param guildId Guild identifier.
   * @param key Config key registered in the registry.
   * @param partial Partial update to apply.
   * @sideEffects Writes to provider and updates cache.
   * @errors None thrown; failures log and no-op.
   */
  async set<K extends ConfigKey>(
    guildId: string,
    key: K,
    partial: Partial<ConfigOf<K>>,
  ): Promise<void> {
    const schema = getSchema(key);
    if (!schema) {
      console.warn(
        `[config] Config key '${key}' has no schema registered. Ignoring update.`,
      );
      return;
    }

    // 1. Get current valid state (with defaults)
    const current = await this.get(guildId, key);

    // WHY: validate the final state (not just the patch) to enforce schema invariants.
    const merged = { ...(current as any), ...(partial as any) };

    const validation = schema.safeParse(merged);
    if (!validation.success) {
      console.warn(
        `[config] Invalid configuration update for '${key}'. Ignoring update.`,
        validation.error,
      );
      return;
    }

    try {
      await this.provider.setConfig(guildId, key, partial);
    } catch (error) {
      console.warn("[config] Failed to persist config update.", {
        guildId,
        key,
        error,
      });
      return;
    }

    // Keep in-memory cache coherent (avoid an extra DB roundtrip on hot paths).
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
