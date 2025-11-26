/**
 * Motivación: normalizar el manejo de canales de guild (index) para reducir wiring repetitivo.
 *
 * Idea/concepto: agrupa constantes y helpers para crear/consultar canales de forma segura.
 *
 * Alcance: utilidades para canales; no configura permisos detallados ni políticas de moderación.
 */
// Uses the Mongo-backed repository layer at "@/db/repositories"
import * as repo from "@/db/repositories";
import type {
	CoreChannelRecord,
	GuildChannelsRecord,
	ManagedChannelRecord,
} from "@/schemas/guild";
import type { CoreChannelName } from "./constants";
import { UsingClient } from "seyfert";

/** Get the full channels JSON for a guild. */
export async function getGuildChannels(guildId: string): Promise<GuildChannelsRecord> {
	await repo.ensureGuild(guildId);
	// repo.readChannels returns the channels JSONB blob
	let channels = await repo.readChannels(guildId);
	return channels;
}

/** Set a core channel and return that single core entry. */
export async function setCoreChannel(
	guildId: string,
	name: CoreChannelName,
	channelId: string,
): Promise<CoreChannelRecord> {
	await repo.ensureGuild(guildId);
	await repo.setCoreChannel(guildId, name, channelId);
	// repo.setCoreChannel returns the whole channels map; we re-read the single entry
	return (await repo.getCoreChannel(guildId, name)) as CoreChannelRecord;
}

/** Add a managed channel and return the created record. */
export async function addManagedChannel(
	guildId: string,
	label: string,
	channelId: string,
): Promise<ManagedChannelRecord> {
	await repo.ensureGuild(guildId);
	// Perform the write
	await repo.addManagedChannel(guildId, { label, channelId });
	// Find the created entry by label+channelId
	const channels = (await repo.readChannels(guildId)) as GuildChannelsRecord;
	const created =
		Object.values(channels?.managed ?? {}).find(
			(m: any) => m?.label === label && m?.channelId === channelId,
		) ?? null;

	if (!created) {
		throw new Error("No se encontro el canal administrado recien creado despues de insertarlo.");
	}
	return created as ManagedChannelRecord;
}

/** Remove by key or label; returns true only if something actually got removed. */
export async function removeManagedChannel(
	guildId: string,
	identifier: string,
): Promise<boolean> {
	await repo.ensureGuild(guildId);
	const before = (await repo.readChannels(guildId)) as GuildChannelsRecord;
	const existed =
		!!before?.managed?.[identifier] ||
		Object.values(before?.managed ?? {}).some((m: any) => m?.label === identifier);

	if (!existed) return false;

	await repo.removeManagedChannel(guildId, identifier);
	return true;
}


/**
 * Removes channels that don't exist in the guild anymore.
 */
export async function removeInvalidChannels(
	guildId: string,
	client: UsingClient
): Promise<void> {
	await repo.ensureGuild(guildId);
	const channels = (await repo.readChannels(guildId)) as GuildChannelsRecord;

	let to_delete: string[] = [];

	Object.entries(channels.core).forEach(async ([name, record]) => {
		if (!record) {
			to_delete.push(name);
			return;
		}

		const channel = await client.channels.fetch(record.channelId).catch(() => null);
		if (!channel) {
			to_delete.push(name);
		}
	});

	await Promise.all(
		to_delete.map(async (name) => {
			await repo.setCoreChannel(guildId, name as CoreChannelName, "");
		})
	);

	to_delete = [];

	Object.entries(channels.managed).forEach(async ([alias, record]) => {
		const channel = await client.channels.fetch(record.channelId).catch(() => null);
		if (!channel) {
			to_delete.push(alias);
		}

	});

	await Promise.all(
		to_delete.map(async (alias) => {
			await repo.removeManagedChannel(guildId, alias);
		})
	);
}

	// passthrough exports
	export {
		CORE_CHANNEL_DEFINITIONS,
		type CoreChannelName,
	} from "./constants";

