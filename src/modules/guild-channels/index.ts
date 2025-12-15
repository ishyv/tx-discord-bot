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
} from "@/db/schemas/guild";
import type { CoreChannelName } from "./constants";
import { UsingClient } from "seyfert";

const emptyChannels = (): GuildChannelsRecord => ({
	core: {
		messageLogs: null,
		voiceLogs: null,
		ticketLogs: null,
		tickets: null,
		ticketCategory: null,
		pointsLog: null,
		generalLogs: null,
		banSanctions: null,
		staff: null,
		suggestions: null,
		repRequests: null,
		offersReview: null,
		approvedOffers: null,
	},
	managed: {},
	ticketMessageId: null,
	ticketHelperRoles: [],
	ticketCategoryId: null,
});

const getCoreChannelRecord = (
	channels: GuildChannelsRecord | undefined | null,
	name: string,
): CoreChannelRecord | null => {
	if (!channels?.core) return null;
	return (channels.core as Record<string, CoreChannelRecord | null | undefined>)[name] ?? null;
};

export const getCoreChannelId = (
	channels: GuildChannelsRecord | undefined | null,
	name: string,
): string | null => {
	const record = getCoreChannelRecord(channels, name);
	return record?.channelId ?? null;
};

/** Get the full channels JSON for a guild. */
export async function getGuildChannels(guildId: string): Promise<GuildChannelsRecord> {
	const guild = await getGuild(guildId);
	return guild?.channels ?? emptyChannels();
}

/** Get a specific core channel record. */
export async function getCoreChannel(
	guildId: string,
	name: CoreChannelName,
): Promise<CoreChannelRecord | null> {
	const guild = await getGuild(guildId);
	return getCoreChannelRecord(guild?.channels, name);
}

/** Set a core channel and return that single core entry. */
export async function setCoreChannel(
	guildId: string,
	name: CoreChannelName,
	channelId: string,
): Promise<CoreChannelRecord> {
	return withGuild(guildId, (guild) => {
		if (!guild.channels.core) guild.channels.core = {} as Record<string, CoreChannelRecord | null>;
		const record: CoreChannelRecord = { channelId };
		guild.channels.core[name] = record;
		return record;
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
		const managed = guild.channels.managed as Record<string, ManagedChannelRecord | undefined>;
		const entry = Object.entries(managed).find(([, m]) => m?.label === identifier);

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
			const core = channels.core as Record<string, CoreChannelRecord | null>;
			for (const [name, record] of Object.entries(core)) {
				if (!record) continue;
				const channel = await client.channels.fetch(record.channelId).catch(() => null);
				if (!channel) {
					core[name] = null;
				}
			}
		}

		// Check managed channels
		if (channels.managed) {
			const managed = channels.managed as Record<string, ManagedChannelRecord>;
			for (const [key, record] of Object.entries(managed)) {
				if (!record) continue;
				const channel = await client.channels.fetch(record.channelId).catch(() => null);
				if (!channel) {
					delete managed[key];
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
