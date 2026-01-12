/**
 * Mongo-backed provider for per-guild configuration slices.
 *
 * Role in system:
 * - Reads and writes nested subtrees inside the guild document using dot paths.
 * - Keeps callers decoupled from Mongo update mechanics.
 *
 * Dependencies:
 * - `ensureGuild` for normalized reads.
 * - `updateGuildPaths` for atomic partial writes.
 *
 * Invariants:
 * - No throws: failures log and return safe defaults.
 * - Missing path => read returns `{}`, write is ignored.
 *
 * Gotchas:
 * - Paths are resolved at runtime from the registry; missing registration
 *   silently degrades behavior to defaults/no-op.
 */

import { GuildStore, updateGuildPaths } from "@/db/repositories/guilds";
import { getConfigPath, type ConfigKey } from "./definitions";

export interface ConfigProvider {
  /**
   * Read a config slice for a guild.
   *
   * @param guildId Guild identifier.
   * @param key Config key registered in the registry.
   * @returns Partial config object (empty if missing).
   * @sideEffects Reads from Mongo via `ensureGuild`.
   * @errors None thrown; failures return `{}` and log.
   */
  getConfig<TConfig>(guildId: string, key: ConfigKey): Promise<Partial<TConfig>>;
  /**
   * Persist a partial config update for a guild.
   *
   * @param guildId Guild identifier.
   * @param key Config key registered in the registry.
   * @param partial Partial update (only provided keys are written).
   * @sideEffects Writes to Mongo via `updateGuildPaths`.
   * @errors None thrown; failures log and no-op.
   */
  setConfig<TConfig>(
    guildId: string,
    key: ConfigKey,
    partial: Partial<TConfig>,
  ): Promise<void>;
}

const resolvePath = (key: ConfigKey): string | null => {
  const path = getConfigPath(key);
  if (!path) {
    // WHY: missing paths should not break runtime flows.
    // RISK: config reads/writes become no-ops for the missing key.
    console.warn(`[config] No path registered for key '${key}'.`);
    return null;
  }
  return path;
};

/**
 * MongoDB implementation of the ConfigProvider.
 */
export class MongoGuildConfigProvider implements ConfigProvider {
  /**
   * Resolve a config slice by traversing the guild document.
   *
   * @returns Partial config object (empty on missing/invalid path).
   * @sideEffects Mongo read.
   */
  async getConfig<TConfig>(
    guildId: string,
    key: ConfigKey,
  ): Promise<Partial<TConfig>> {
    const path = resolvePath(key);
    if (!path) return {};

    try {
      const res = await GuildStore.ensure(guildId);
      if (res.isErr()) return {};
      const guild = res.unwrap();

      // WHY: manual traversal keeps the provider independent of schema layers.
      // RISK: if the path diverges from the DB shape, we return `{}` and rely on defaults.
      const parts = path.split(".");
      let current: any = guild;

      for (const part of parts) {
        if (current === null || current === undefined) return {};
        current = current[part];
      }

      return (current as Partial<TConfig>) || {};
    } catch (error) {
      // WHY: runtime policy forbids throwing in hot paths.
      console.warn("[config] Failed to read config from Mongo.", {
        guildId,
        key,
        error,
      });
      return {};
    }
  }

  /**
   * Persist a partial config update via dot-path $set operations.
   *
   * WHY: avoid clobbering unrelated config written by other modules.
   * RISK: nested objects passed in `partial` replace the whole subtree.
   */
  async setConfig<TConfig>(
    guildId: string,
    key: ConfigKey,
    partial: Partial<TConfig>,
  ): Promise<void> {
    const path = resolvePath(key);
    if (!path) return;

    const updates: Record<string, unknown> = {};
    for (const [subKey, value] of Object.entries(partial)) {
      if (value === undefined) continue;
      updates[`${path}.${subKey}`] = value;
    }

    if (!Object.keys(updates).length) return;

    try {
      // WHY: atomic $set avoids "last write wins" on full document replaces.
      await updateGuildPaths(guildId, updates);
    } catch (error) {
      // WHY: callers already handle user-facing feedback; do not throw here.
      console.warn("[config] Failed to write config to Mongo.", {
        guildId,
        key,
        error,
      });
    }
  }
}
