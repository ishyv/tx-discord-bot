/**
 * Guild configuration provider backed by Mongo (native driver via guild repository).
 * Purpose: read/write per-guild configuration slices (features, channels, reputation) without exposing persistence details.
 */

import { ensureGuild, updateGuildPaths } from "@/db/repositories/guilds";
import { ConfigurableModule } from "./constants";

export interface ConfigProvider {
    getConfig<TConfig>(guildId: string, key: string): Promise<Partial<TConfig>>;
    setConfig<TConfig>(guildId: string, key: string, partial: Partial<TConfig>): Promise<void>;
}

/**
 * Mapping of logical configuration keys (ConfigurableModule) to MongoDB document paths.
 */
const CONFIG_PATHS: Record<string, string> = {
    [ConfigurableModule.AI]: "ai",
    [ConfigurableModule.Reputation]: "reputation",
    [ConfigurableModule.Tops]: "features.tops",
    [ConfigurableModule.ForumAutoReply]: "forumAutoReply",
    [ConfigurableModule.ChannelsCore]: "channels.core",
    [ConfigurableModule.ChannelsManaged]: "channels.managed",
    [ConfigurableModule.Tickets]: "channels.core",
    [ConfigurableModule.Offers]: "channels.core",
};

/**
 * MongoDB implementation of the ConfigProvider.
 */
export class MongoGuildConfigProvider implements ConfigProvider {

    async getConfig<TConfig>(guildId: string, key: string): Promise<Partial<TConfig>> {
        const path = CONFIG_PATHS[key];
        if (!path) {
            throw new Error(`No mapped path for config key '${key}'`);
        }

        const guild = await ensureGuild(guildId);
        if (!guild) return {};

        // Navigate to the nested property manually
        const parts = path.split('.');
        let current: any = guild;

        for (const part of parts) {
            if (current === null || current === undefined) return {};
            current = current[part];
        }

        return (current as Partial<TConfig>) || {};
    }

    async setConfig<TConfig>(guildId: string, key: string, partial: Partial<TConfig>): Promise<void> {
        const path = CONFIG_PATHS[key];
        if (!path) {
            throw new Error(`No mapped path for config key '${key}'`);
        }

        const updates: Record<string, unknown> = {};
        for (const [subKey, value] of Object.entries(partial)) {
            if (value === undefined) continue;
            updates[`${path}.${subKey}`] = value;
        }

        if (!Object.keys(updates).length) return;

        // Atomic $set update to avoid clobbering unrelated config updates.
        await updateGuildPaths(guildId, updates);
    }
}
