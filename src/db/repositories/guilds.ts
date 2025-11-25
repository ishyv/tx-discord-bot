/**
 * Motivación: concentrar operaciones de acceso a datos de guilds en una API reutilizable.
 *
 * Idea/concepto: envuelve modelos y consultas en funciones claras para que el resto del código no conozca detalles de persistencia.
 *
 * Alcance: provee CRUD y helpers de datos; no define reglas de negocio ni validaciones complejas.
 */
import { connectMongo } from "../client";
import { GuildModel, type GuildDoc } from "../models/guild";
import type {
  CoreChannelRecord,
  GuildChannelsRecord,
  GuildRolesRecord,
  ManagedChannelRecord,
  GuildFeaturesRecord,
  GuildFeatureFlag,
} from "@/schemas/guild";
import { DEFAULT_GUILD_FEATURES } from "@/schemas/guild";
import { deepClone } from "@/db/helpers";

type ChannelsMutator = (current: GuildChannelsRecord) => GuildChannelsRecord;
type RolesMutator = (current: GuildRolesRecord) => GuildRolesRecord;

const EMPTY_CHANNELS: GuildChannelsRecord = {
  core: {} as Record<string, CoreChannelRecord | null>,
  managed: {},
  ticketMessageId: null,
  ticketHelperRoles: [],
} as any as GuildChannelsRecord;

const mergeFeatures = (
  features: GuildFeaturesRecord | null | undefined,
): GuildFeaturesRecord => {
  return { ...DEFAULT_GUILD_FEATURES, ...(features ?? {}) };
};

function assertFeatureName(feature: string): asserts feature is GuildFeatureFlag {
  if (!Object.hasOwn(DEFAULT_GUILD_FEATURES, feature)) {
    throw new Error(`Unknown guild feature: ${feature}`);
  }
}

const toGuild = (doc: GuildDoc | null): GuildDoc | null => {
  if (!doc) return null;
  return {
    ...doc,
    id: doc._id,
    roles: (doc.roles as GuildRolesRecord) ?? {},
    channels: (doc.channels as GuildChannelsRecord) ?? deepClone(EMPTY_CHANNELS),
    features: mergeFeatures(doc.features as GuildFeaturesRecord),
    pendingTickets: Array.isArray(doc.pendingTickets)
      ? doc.pendingTickets.filter((v): v is string => typeof v === "string")
      : [],
  } as GuildDoc;
};

/**
 * Retrieve a guild document by ID.
 */
export async function getGuild(id: string): Promise<GuildDoc | null> {
  await connectMongo();
  const doc = await GuildModel.findById(id).lean();
  return toGuild(doc);
}

/**
 * Ensure a guild document exists, creating it if necessary.
 */
export async function ensureGuild(id: string): Promise<GuildDoc> {
  await connectMongo();
  const doc = await GuildModel.findOneAndUpdate(
    { _id: id },
    {
      $setOnInsert: {
        _id: id,
        roles: {},
        channels: deepClone(EMPTY_CHANNELS),
        pendingTickets: [],
        features: { ...DEFAULT_GUILD_FEATURES },
        reputation: { keywords: [] },
      },
    },
    { upsert: true, new: true, lean: true },
  );
  const mapped = toGuild(doc);
  if (!mapped) throw new Error(`ensureGuild failed (id=${id})`);
  return mapped;
}

/**
 * Read the feature flags for a guild, merged with defaults.
 */
export async function readFeatures(id: string): Promise<GuildFeaturesRecord> {
  const g = await ensureGuild(id);
  return mergeFeatures(g.features);
}

/**
 * Set a single feature flag.
 */
export async function setFeature(
  id: string,
  feature: GuildFeatureFlag,
  enabled: boolean,
): Promise<GuildFeaturesRecord> {
  await connectMongo();
  assertFeatureName(feature);
  const doc = await GuildModel.findOneAndUpdate(
    { _id: id },
    {
      $set: {
        [`features.${feature}`]: enabled,
        updatedAt: new Date(),
      },
    },
    { new: true, lean: true, projection: { features: 1 } },
  );
  return mergeFeatures(doc?.features as GuildFeaturesRecord);
}

/**
 * Delete a guild document.
 */
export async function deleteGuild(id: string): Promise<boolean> {
  await connectMongo();
  const res = await GuildModel.deleteOne({ _id: id });
  return (res.deletedCount ?? 0) > 0;
}

/**
 * Update guild fields.
 */
export async function updateGuild(
  id: string,
  update: Partial<GuildDoc>,
): Promise<GuildDoc | null> {
  await connectMongo();
  const doc = await GuildModel.findOneAndUpdate(
    { _id: id },
    { $set: { ...update, updatedAt: new Date() } },
    { new: true, lean: true },
  );
  return toGuild(doc);
}

/**
 * Read the channels configuration for a guild.
 */
export async function readChannels(id: string): Promise<GuildChannelsRecord> {
  const g = await ensureGuild(id);
  const channels = deepClone(g.channels ?? {}) as Partial<GuildChannelsRecord>;
  return {
    ...channels,
    core: channels.core ?? {},
    managed: channels.managed ?? {},
    ticketMessageId:
      typeof channels.ticketMessageId === "string" || channels.ticketMessageId === null
        ? channels.ticketMessageId
        : null,
    ticketHelperRoles: Array.isArray((channels as any).ticketHelperRoles)
      ? (channels as any).ticketHelperRoles.filter(
        (roleId: any): roleId is string => typeof roleId === "string" && roleId.length > 0,
      )
      : [],
  } as GuildChannelsRecord;
}

/**
 * Update the channels configuration for a guild.
 */
export async function writeChannels(
  id: string,
  mutate: ChannelsMutator,
): Promise<GuildChannelsRecord> {
  const current = await readChannels(id);
  const next = deepClone(mutate(current));
  const doc = await GuildModel.findOneAndUpdate(
    { _id: id },
    { $set: { channels: next, updatedAt: new Date() } },
    { new: true, lean: true },
  );
  const mapped = toGuild(doc);
  return (mapped?.channels ?? deepClone(EMPTY_CHANNELS)) as GuildChannelsRecord;
}

/**
 * Read the roles configuration for a guild.
 */
export async function readRoles(id: string): Promise<GuildRolesRecord> {
  const g = await ensureGuild(id);
  return deepClone((g.roles as GuildRolesRecord) ?? {});
}

/**
 * Update the roles configuration for a guild.
 */
export async function writeRoles(
  id: string,
  mutate: RolesMutator,
): Promise<GuildRolesRecord> {
  const current = await readRoles(id);
  const next = deepClone(mutate(current));
  const doc = await GuildModel.findOneAndUpdate(
    { _id: id },
    { $set: { roles: next, updatedAt: new Date() } },
    { new: true, lean: true },
  );
  return deepClone((doc?.roles as GuildRolesRecord) ?? {});
}

/**
 * Get the list of pending ticket IDs for a guild.
 */
export async function getPendingTickets(guildId: string): Promise<string[]> {
  const g = await ensureGuild(guildId);
  return Array.isArray(g.pendingTickets) ? deepClone(g.pendingTickets) : [];
}

/**
 * Update the list of pending ticket IDs for a guild.
 */
export async function setPendingTickets(
  guildId: string,
  update: (tickets: string[]) => string[],
): Promise<string[]> {
  const guild = await ensureGuild(guildId);
  const current = Array.isArray(guild.pendingTickets)
    ? deepClone(guild.pendingTickets)
    : [];
  const next = update(deepClone(current));
  const sanitized = Array.isArray(next)
    ? next.filter((id): id is string => typeof id === "string")
    : [];
  const unique = Array.from(new Set(sanitized));
  const doc = await GuildModel.findOneAndUpdate(
    { _id: guildId },
    { $set: { pendingTickets: unique, updatedAt: new Date() } },
    { new: true, lean: true, projection: { pendingTickets: 1 } },
  );
  return deepClone((doc?.pendingTickets as string[]) ?? []);
}

/**
 * Configure a core channel (e.g., welcome, logs).
 */
export async function setCoreChannel(
  id: string,
  name: string,
  channelId: string,
): Promise<GuildChannelsRecord> {
  return writeChannels(id, (c) => {
    const next = deepClone(c);
    next.core = next.core ?? {};
    next.core[name as keyof typeof next.core] = {
      ...(next.core[name as keyof typeof next.core] ?? {
        name,
        label: name,
        channelId: null,
      }),
      channelId,
    } as CoreChannelRecord;
    return next;
  });
}

/**
 * Retrieve a core channel configuration.
 */
export async function getCoreChannel(
  id: string,
  name: string,
): Promise<CoreChannelRecord | null> {
  const c = await readChannels(id);
  const core = c?.core;
  if (!core) return null;
  return (core[name as keyof typeof core] as CoreChannelRecord | null) ?? null;
}

/**
 * Set the ticket category ID for the guild.
 */
export async function setTicketCategory(
  id: string,
  categoryId: string | null,
): Promise<GuildChannelsRecord> {
  return writeChannels(id, (c) => ({
    ...c,
    ticketCategoryId: categoryId,
  }));
}

/**
 * Set the ticket panel message ID.
 */
export async function setTicketMessage(
  id: string,
  messageId: string | null,
): Promise<GuildChannelsRecord> {
  return writeChannels(id, (c) => ({ ...c, ticketMessageId: messageId }));
}

/**
 * List all managed channels (e.g., temporary voice channels).
 */
export async function listManagedChannels(id: string): Promise<ManagedChannelRecord[]> {
  const c = await readChannels(id);
  return Object.values(c.managed ?? {}) as ManagedChannelRecord[];
}

/**
 * Add a new managed channel.
 */
export async function addManagedChannel(
  id: string,
  entry: { key?: string; label: string; channelId: string },
): Promise<GuildChannelsRecord> {
  return writeChannels(id, (c) => {
    const next = deepClone(c);
    next.managed = next.managed ?? {};
    const key = entry.key ?? generateKey(entry.label, Object.keys(next.managed));
    next.managed[key] = {
      id: key,
      label: entry.label,
      channelId: entry.channelId,
    };
    return next;
  });
}

/**
 * Update an existing managed channel.
 */
export async function updateManagedChannel(
  id: string,
  identifier: string,
  patch: Partial<{ label: string; channelId: string }>,
): Promise<GuildChannelsRecord> {
  return writeChannels(id, (c) => {
    const next = deepClone(c);
    const k = resolveManagedKey(next.managed ?? {}, identifier);
    if (!k) return next;
    next.managed[k] = { ...next.managed[k], ...patch } as ManagedChannelRecord;
    return next;
  });
}

/**
 * Remove a managed channel.
 */
export async function removeManagedChannel(
  id: string,
  identifier: string,
): Promise<GuildChannelsRecord> {
  return writeChannels(id, (c) => {
    const next = deepClone(c);
    const k = resolveManagedKey(next.managed ?? {}, identifier);
    if (k) delete next.managed[k];
    return next;
  });
}

/**
 * Retrieve a specific role configuration.
 */
export async function getRole(
  id: string,
  key: string,
): Promise<GuildRolesRecord[string] | null> {
  const r = await readRoles(id);
  return r?.[key] ?? null;
}

/**
 * Insert or update a role configuration.
 */
export async function upsertRole(
  id: string,
  key: string,
  patch: any,
): Promise<GuildRolesRecord> {
  return writeRoles(id, (r) => ({
    ...r,
    [key]: {
      ...(r?.[key] ?? {}),
      ...patch,
      updatedAt: new Date().toISOString(),
    },
  }));
}

/**
 * Remove a role configuration.
 */
export async function removeRole(
  id: string,
  key: string,
): Promise<GuildRolesRecord> {
  return writeRoles(id, (r) => {
    if (!r?.[key]) return r;
    const { [key]: _omit, ...rest } = r;
    return rest;
  });
}

// --- Role overrides & limits ---

const normAction = (k: string) => k.trim().toLowerCase().replace(/[\s-]+/g, "_");

/**
 * Get overrides for a specific role.
 */
export async function getRoleOverrides(
  guildId: string,
  roleKey: string,
): Promise<Record<string, unknown>> {
  const roles = await readRoles(guildId);
  return { ...(roles?.[roleKey]?.reach ?? {}) };
}

/**
 * Set an override for a specific role and action.
 */
export async function setRoleOverride(
  guildId: string,
  roleKey: string,
  actionKey: string,
  override: any,
): Promise<void> {
  await writeRoles(guildId, (roles: any = {}) => {
    const k = normAction(actionKey);
    const ex = roles[roleKey] ?? {};
    const reach = { ...(ex.reach ?? {}) };
    reach[k] = override;
    roles[roleKey] = { ...ex, reach, updatedAt: new Date().toISOString() };
    return roles;
  });
}

/**
 * Clear a specific override.
 */
export async function clearRoleOverride(
  guildId: string,
  roleKey: string,
  actionKey: string,
): Promise<boolean> {
  let removed = false;
  await writeRoles(guildId, (roles: any = {}) => {
    const ex = roles[roleKey];
    if (!ex?.reach) return roles;
    const k = normAction(actionKey);
    if (!(k in ex.reach)) return roles;
    const reach = { ...ex.reach };
    delete reach[k];
    removed = true;
    roles[roleKey] = { ...ex, reach, updatedAt: new Date().toISOString() };
    return roles;
  });
  return removed;
}

/**
 * Reset all overrides for a role.
 */
export async function resetRoleOverrides(
  guildId: string,
  roleKey: string,
): Promise<void> {
  await writeRoles(guildId, (roles: any = {}) => {
    const ex = roles[roleKey] ?? {};
    roles[roleKey] = { ...ex, reach: {}, updatedAt: new Date().toISOString() };
    return roles;
  });
}

/**
 * Get limits for a specific role.
 */
export async function getRoleLimits(
  guildId: string,
  roleKey: string,
): Promise<Record<string, unknown>> {
  const roles = await readRoles(guildId);
  return { ...(roles?.[roleKey]?.limits ?? {}) };
}

/**
 * Set a limit for a specific role and action.
 */
export async function setRoleLimit(
  guildId: string,
  roleKey: string,
  actionKey: string,
  limit: { limit: number; window?: string | null; windowSeconds?: number | null },
): Promise<void> {
  await writeRoles(guildId, (roles: any = {}) => {
    const k = normAction(actionKey);
    const ex = roles[roleKey] ?? {};
    const limits = { ...(ex.limits ?? {}) };
    limits[k] = {
      limit: limit.limit,
      window: limit.window ?? null,
      windowSeconds: limit.windowSeconds ?? null,
    };
    roles[roleKey] = { ...ex, limits, updatedAt: new Date().toISOString() };
    return roles;
  });
}

/**
 * Clear a specific limit.
 */
export async function clearRoleLimit(
  guildId: string,
  roleKey: string,
  actionKey: string,
): Promise<boolean> {
  let removed = false;
  await writeRoles(guildId, (roles: any = {}) => {
    const ex = roles[roleKey];
    if (!ex?.limits) return roles;
    const k = normAction(actionKey);
    if (!(k in ex.limits)) return roles;
    const limits = { ...ex.limits };
    delete limits[k];
    removed = true;
    roles[roleKey] = { ...ex, limits, updatedAt: new Date().toISOString() };
    return roles;
  });
  return removed;
}

/**
 * Ensure a role configuration exists.
 */
export async function ensureRoleExists(
  guildId: string,
  roleKey: string,
): Promise<void> {
  await upsertRole(guildId, roleKey, {});
}

// --- helpers ---

function generateKey(label: string, existing: string[]): string {
  let base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (!base) base = "channel";
  let candidate = base;
  let counter = 1;
  while (existing.includes(candidate)) {
    candidate = `${base}-${counter++}`;
  }
  return candidate;
}

function resolveManagedKey(
  map: Record<string, any>,
  identifier: string,
): string | null {
  if (map[identifier]) return identifier;
  const found = Object.values(map).find(
    (entry: any) => entry.label === identifier || entry.id === identifier,
  );
  return found ? (found as any).id : null;
}
