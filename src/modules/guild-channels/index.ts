/**
 * Motivación: normalizar el manejo de canales de guild (index) para reducir wiring repetitivo.
 *
 * Idea/concepto: agrupa constantes y helpers para crear/consultar canales de forma segura.
 *
 * Alcance: utilidades para canales; no configura permisos detallados ni políticas de moderación.
 */
// Uses the Mongo-backed repository layer at "@/db/repositories"
import { getGuild, withGuild } from "@/db/repositories/with_guild";
import type {
	CoreChannelRecord,
	GuildChannelsRecord,
	ManagedChannelRecord,
} from "@/db/models/guild.schema";
import type { CoreChannelName } from "./constants";
import { UsingClient } from "seyfert";

/** Get the full channels JSON for a guild. */
export async function getGuildChannels(guildId: string): Promise<GuildChannelsRecord> {
	const guild = await getGuild(guildId);
	return guild?.channels ?? { core: {}, managed: {}, ticketMessageId: null, ticketHelperRoles: [] } as any;
}

/** Get a specific core channel record. */
export async function getCoreChannel(
	guildId: string,
	name: CoreChannelName,
): Promise<CoreChannelRecord | null> {
	const guild = await getGuild(guildId);
	return guild?.channels?.core?.[name] ?? null;
}

/** Set a core channel and return that single core entry. */
export async function setCoreChannel(
	guildId: string,
	name: CoreChannelName,
	channelId: string,
): Promise<CoreChannelRecord> {
	return withGuild(guildId, (guild) => {
		if (!guild.channels.core) guild.channels.core = {} as any;
		guild.channels.core[name] = { channelId };
		return guild.channels.core[name]!;
	});
}

/** Add a managed channel and return the created record. */
export async function addManagedChannel(
	guildId: string,
	label: string,
	channelId: string,
): Promise<ManagedChannelRecord> {
	return withGuild(guildId, (guild) => {
		if (!guild.channels.managed) guild.channels.managed = {};

		// Create a simple slug/key from label if needed, or use a UUID. 
		const id = Date.now().toString(36) + Math.random().toString(36).slice(2);

		const record: ManagedChannelRecord = { label, channelId, id };
		guild.channels.managed[id] = record;
		return record;
	});
}

/** Remove by key or label; returns true only if something actually got removed. */
export async function removeManagedChannel(
	guildId: string,
	identifier: string,
): Promise<boolean> {
	return withGuild(guildId, (guild) => {
		if (!guild.channels.managed) return false;

		// Try to find by key
		if (guild.channels.managed[identifier]) {
			delete guild.channels.managed[identifier];
			return true;
		}

		// Try to find by label
		const entry = Object.entries(guild.channels.managed).find(
			([_, m]) => m?.label === identifier
		);

		if (entry) {
			delete guild.channels.managed[entry[0]];
			return true;
		}

		return false;
	});
}

/**
 * Removes channels that don't exist in the guild anymore.
 */
export async function removeInvalidChannels(
	guildId: string,
	client: UsingClient
): Promise<void> {
	await withGuild(guildId, async (guild) => {
		const channels = guild.channels;
		if (!channels) return;

		// Check core channels
		if (channels.core) {
			for (const [name, record] of Object.entries(channels.core)) {
				if (!record) continue;
				const channel = await client.channels.fetch(record.channelId).catch(() => null);
				if (!channel) {
					// @ts-ignore
					channels.core[name] = null;
				}
			}
		}

		// Check managed channels
		if (channels.managed) {
			for (const [key, record] of Object.entries(channels.managed)) {
				if (!record) continue;
				const channel = await client.channels.fetch(record.channelId).catch(() => null);
				if (!channel) {
					delete channels.managed[key];
				}
			}
		}
	});
}

// passthrough exports
export {
	CORE_CHANNEL_DEFINITIONS,
	type CoreChannelName,
} from "./constants";
