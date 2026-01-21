/**
 * API de canales de guild: core + managed + helpers de saneamiento.
 *
 * Encaje: capa de dominio usada por logging, tickets, offers, etc. para resolver
 * canales configurados y escribir rutas en `GuildStore` sin duplicar lógica de
 * Mongo o validaciones de forma.
 * Dependencias: `GuildStore`/`updateGuildPaths` (Zod + pipelines), constantes de
 * core channels, y Seyfert client para validar existencia real de canales.
 * Invariantes: `core` es un objeto de claves conocidas; `managed` es un map
 * arbitrario indexado por id; `ticketMessageId` y helpers se mantienen como
 * strings o null. Mantiene arrays y objetos vacíos si faltan.
 * Gotchas: los defaults aquí pueden divergir del schema histórico; cualquier
 * cambio de clave core requiere actualizar UI/handlers. `removeInvalidChannels`
 * no actualiza `updatedAt` más allá de lo que `updateGuildPaths` haga.
 */

import type { UsingClient } from "seyfert";
// Uses the Mongo-backed repository layer at "@/db/repositories"
import { GuildStore, updateGuildPaths } from "@/db/repositories/guilds";
import type {
  CoreChannelRecord,
  GuildChannelsRecord,
  ManagedChannelRecord,
} from "@/db/schemas/guild";
import type { CoreChannelName } from "./constants";
import { isSnowflake } from "@/utils/snowflake";

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
  return (
    (channels.core as Record<string, CoreChannelRecord | null | undefined>)[
      name
    ] ?? null
  );
};

export const getCoreChannelId = (
  channels: GuildChannelsRecord | undefined | null,
  name: string,
): string | null => {
  const record = getCoreChannelRecord(channels, name);
  return record?.channelId ?? null;
};

/**
 * Obtiene el JSON completo de canales (core/managed) para un guild.
 * Side effects: lectura de `GuildStore` (no upsert) y aplicación de defaults
 * locales si falta el campo.
 * Gotchas: defaults aquí pueden diferir del schema legacy; coordinar migraciones
 * si se agregan nuevas claves core.
 */
export async function getGuildChannels(
  guildId: string,
): Promise<GuildChannelsRecord> {
  const res = await GuildStore.get(guildId);
  const guild = res.unwrap();
  return guild?.channels ?? emptyChannels();
}

/**
 * Recupera una entrada core concreta sin modificar el documento.
 * Retorna `null` si no existe o si `core` no es objeto.
 */
export async function getCoreChannel(
  guildId: string,
  name: CoreChannelName,
): Promise<CoreChannelRecord | null> {
  const res = await GuildStore.get(guildId);
  const guild = res.unwrap();
  return getCoreChannelRecord(guild?.channels, name);
}

/**
 * Define/actualiza un canal core específico y devuelve el registro escrito.
 * Side effects: escribe vía `updateGuildPaths` (upsert parcial) y actualiza
 * `updatedAt` según pipeline.
 */
export async function setCoreChannel(
  guildId: string,
  name: CoreChannelName,
  channelId: string,
): Promise<CoreChannelRecord> {
  const record: CoreChannelRecord = { channelId };
  await updateGuildPaths(guildId, {
    [`channels.core.${name}`]: record,
  });
  return record;
}

/**
 * Agrega un canal gestionado (managed) con id generado y lo persiste.
 * RISK: el id es pseudo-aleatorio sin colisión check; muy improbable pero no
 * imposible en alta concurrencia.
 */
export async function addManagedChannel(
  guildId: string,
  label: string,
  channelId: string,
): Promise<ManagedChannelRecord> {
  // Create a simple slug/key from label if needed, or use a UUID.
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);

  const record: ManagedChannelRecord = { label, channelId, id };
  await updateGuildPaths(guildId, {
    [`channels.managed.${id}`]: record,
  });

  return record;
}

/**
 * Elimina un canal managed por id o label; retorna true si algo se removió.
 * Gotcha: buscar por label es O(n) sobre el map actual; aceptable por tamaño.
 */
export async function removeManagedChannel(
  guildId: string,
  identifier: string,
): Promise<boolean> {
  const res = await GuildStore.get(guildId);
  const guild = res.unwrap();
  const managed = (guild?.channels?.managed ?? {}) as Record<
    string,
    ManagedChannelRecord | undefined
  >;

  // Try to find by key
  if (managed[identifier]) {
    await updateGuildPaths(
      guildId,
      {},
      { unset: [`channels.managed.${identifier}`] },
    );
    return true;
  }

  // Try to find by label
  const entry = Object.entries(managed).find(
    ([, m]) => m?.label === identifier,
  );

  if (entry) {
    await updateGuildPaths(
      guildId,
      {},
      { unset: [`channels.managed.${entry[0]}`] },
    );
    return true;
  }

  return false;
}

/**
 * Limpia rutas de canales que ya no existen en Discord (core y managed).
 *
 * Propósito: evitar retries fallidos de logging/tickets al eliminar canales.
 * Side effects: llama a Discord por cada canal configurado; luego persiste
 * null/unset según corresponda. No lanza; aborta silenciosamente si nada cambia.
 */
export async function removeInvalidChannels(
  guildId: string,
  client: UsingClient,
): Promise<void> {
  const channels = await getGuildChannels(guildId);

  const sets: Record<string, unknown> = {};
  const unsets: string[] = [];

  // Check core channels
  const core = channels.core as Record<string, CoreChannelRecord | null>;
  for (const [name, record] of Object.entries(core)) {
    if (!record) continue;
    if (!isSnowflake(record.channelId)) {
      sets[`channels.core.${name}`] = null;
      continue;
    }
    const channel = await client.channels
      .fetch(record.channelId)
      .catch(() => null);
    if (!channel) {
      sets[`channels.core.${name}`] = null;
    }
  }

  // Check managed channels
  const managed = channels.managed as Record<string, ManagedChannelRecord>;
  for (const [key, record] of Object.entries(managed)) {
    if (!record) continue;
    if (!isSnowflake(record.channelId)) {
      unsets.push(`channels.managed.${key}`);
      continue;
    }
    const channel = await client.channels
      .fetch(record.channelId)
      .catch(() => null);
    if (!channel) {
      unsets.push(`channels.managed.${key}`);
    }
  }

  if (!Object.keys(sets).length && !unsets.length) return;

  await updateGuildPaths(guildId, sets, { unset: unsets });
}

// passthrough exports
export {
  CORE_CHANNEL_DEFINITIONS,
  type CoreChannelName,
} from "./constants";
