/**
 * Guild configuration provider backed by Mongo (native driver via guild repository).
 * Purpose: read/write per-guild configuration slices (features, channels, reputation) without exposing persistence details.
 */

import { ensureGuild, updateGuild } from "@/db/repositories/guilds";
import { ConfigurableModule } from "./constants";

export interface ConfigProvider {
    getConfig<TConfig>(guildId: string, key: string): Promise<Partial<TConfig>>;
    setConfig<TConfig>(guildId: string, key: string, partial: Partial<TConfig>): Promise<void>;
}

/**
 * Mapping of logical configuration keys (ConfigurableModule) to MongoDB document paths.
 */
const CONFIG_PATHS: Record<string, string> = {
    [ConfigurableModule.Reputation]: "reputation",
    [ConfigurableModule.Tops]: "features.tops",
    [ConfigurableModule.ChannelsCore]: "channels.core",
    [ConfigurableModule.ChannelsManaged]: "channels.managed",
    [ConfigurableModule.Tickets]: "channels.core"
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

        const guild = await ensureGuild(guildId);
        const updated = { ...guild };

        for (const [subKey, value] of Object.entries(partial)) {
            setNested(updated, `${path}.${subKey}`, value);
        }

        await updateGuild(guildId, updated);
    }
}

function setNested(obj: Record<string, any>, dottedPath: string, value: unknown): void {
    const parts = dottedPath.split('.');
    const last = parts.pop() as string;
    let curr: any = obj;
    for (const part of parts) {
        if (curr[part] === undefined || curr[part] === null || typeof curr[part] !== 'object') {
            curr[part] = {};
        }
        curr = curr[part];
    }
    curr[last] = value;
}
