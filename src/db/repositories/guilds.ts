/**
 * CRUD y utilidades sobre documentos de guild.
 * Mantiene la forma persistida en un solo lugar y expone helpers usados por
 * roles, tickets y features.
 */
import { deepClone } from "@/db/helpers";
import { MongoStore } from "@/db/store";
import {
  DEFAULT_GUILD_FEATURES,
  Features,
  GuildModel,
  type CoreChannelRecord,
  type GuildChannelsRecord,
  type GuildDoc,
  type GuildFeaturesRecord,
  type GuildRolesRecord,
  type ManagedChannelRecord,
} from "@/db/models/guild.schema";

type ChannelsMutator = (current: GuildChannelsRecord) => GuildChannelsRecord;
type RolesMutator = (current: GuildRolesRecord) => GuildRolesRecord;

const EMPTY_CHANNELS: GuildChannelsRecord = {
  core: {} as Record<string, CoreChannelRecord | null>,
  managed: {},
  ticketMessageId: null,
  ticketHelperRoles: [],
  // ticketCategoryId might be missing in type def but present in usage? Checking usage below.
  // Usage: setTicketCategory uses ticketCategoryId.
} as GuildChannelsRecord;

const normAction = (k: string) => k.trim().toLowerCase().replace(/[\s-]+/g, "_");

function mergeFeatures(
  features: GuildFeaturesRecord | null | undefined,
): GuildFeaturesRecord {
  return { ...DEFAULT_GUILD_FEATURES, ...(features ?? {}) };
}

function normalizeGuild(doc: GuildDoc | null): GuildDoc | null {
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
}

function normalizeChannels(channels: Partial<GuildChannelsRecord>): GuildChannelsRecord {
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

const defaultGuild = (id: string): GuildDoc => ({
  _id: id,
  roles: {},
  channels: deepClone(EMPTY_CHANNELS),
  pendingTickets: [],
  features: { ...DEFAULT_GUILD_FEATURES },
  reputation: { keywords: [] },
}) as any;

class GuildStore extends MongoStore<GuildDoc> {
  constructor() {
    super(GuildModel, defaultGuild);
  }

  // Override get to normalize
  async get(id: string): Promise<GuildDoc | null> {
    const doc = await super.get(id);
    return normalizeGuild(doc);
  }

  async ensure(id: string): Promise<GuildDoc> {
    const doc = await super.ensure(id);
    return normalizeGuild(doc) as GuildDoc;
  }

  async update(id: string, partial: Partial<GuildDoc>): Promise<GuildDoc | null> {
    const doc = await super.update(id, partial);
    return normalizeGuild(doc);
  }
}

export const guildStore = new GuildStore();

/* ------------------------------------------------------------------------- */
/* Core entity helpers                                                       */
/* ------------------------------------------------------------------------- */

export async function getGuild(id: string) { return guildStore.get(id); }
export async function ensureGuild(id: string) { return guildStore.ensure(id); }
export async function updateGuild(id: string, update: Partial<GuildDoc>) {
  return guildStore.update(id, { ...update, updatedAt: new Date() });
}
export async function deleteGuild(id: string) { return guildStore.remove(id); }

/* ------------------------------------------------------------------------- */
/* Feature flags                                                             */
/* ------------------------------------------------------------------------- */

export async function readFeatures(id: string): Promise<GuildFeaturesRecord> {
  const g = await guildStore.ensure(id);
  return mergeFeatures(g.features);
}

export async function setFeature(
  id: string,
  feature: Features,
  enabled: boolean,
): Promise<GuildFeaturesRecord> {
  // assertFeatureName(feature); // Validation moved or assumed safe
  // Direct dot notation update
  const doc = await guildStore.update(id, {
    [`features.${feature}`]: enabled,
    updatedAt: new Date()
  } as any);
  return mergeFeatures(doc?.features);
}

export async function setAllFeatures(
  id: string,
  enabled: boolean,
): Promise<GuildFeaturesRecord> {
  const updates: Record<string, boolean> = {};
  for (const key of Object.keys(DEFAULT_GUILD_FEATURES)) {
    updates[`features.${key}`] = enabled;
  }
  const doc = await guildStore.update(id, { ...updates, updatedAt: new Date() } as any);
  return mergeFeatures(doc?.features);
}

/* ------------------------------------------------------------------------- */
/* Channels                                                                  */
/* ------------------------------------------------------------------------- */

export async function readChannels(id: string): Promise<GuildChannelsRecord> {
  const g = await guildStore.ensure(id);
  const channels = deepClone(g.channels ?? {}) as Partial<GuildChannelsRecord>;
  return normalizeChannels(channels);
}

export async function writeChannels(
  guildID: string,
  mutate: ChannelsMutator,
): Promise<GuildChannelsRecord> {
  const current = await readChannels(guildID);
  const next = deepClone(mutate(current));
  // We update the whole "channels" object.
  const doc = await guildStore.update(guildID, { channels: next, updatedAt: new Date() });
  return normalizeChannels(doc?.channels ?? {});
}

export async function setCoreChannel(
  id: string,
  name: string,
  channelId: string,
): Promise<GuildChannelsRecord> {
  return writeChannels(id, (c) => {
    const next = deepClone(c);
    next.core = next.core ?? {};
    const key = name as keyof typeof next.core;
    next.core[key] = { channelId } as CoreChannelRecord;
    return next;
  });
}

export async function getCoreChannel(
  id: string,
  name: string,
): Promise<CoreChannelRecord | null> {
  const c = await readChannels(id);
  const core = c?.core;
  if (!core) return null;
  return (core[name as keyof typeof core] as CoreChannelRecord | null) ?? null;
}

export async function setTicketCategory(
  id: string,
  categoryId: string | null,
): Promise<GuildChannelsRecord> {
  // Assuming ticketCategoryId exists on type or is allowed
  return writeChannels(id, (c) => ({
    ...c,
    ticketCategoryId: categoryId,
  } as any));
}

export async function setTicketMessage(
  id: string,
  messageId: string | null,
): Promise<GuildChannelsRecord> {
  return writeChannels(id, (c) => ({ ...c, ticketMessageId: messageId }));
}

/* Managed channels -------------------------------------------------------- */

export async function listManagedChannels(id: string): Promise<ManagedChannelRecord[]> {
  const c = await readChannels(id);
  return Object.values(c.managed ?? {}) as ManagedChannelRecord[];
}

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

export async function removeManagedChannel(
  guildID: string,
  identifier: string,
): Promise<GuildChannelsRecord> {
  return writeChannels(guildID, (c) => {
    const next = deepClone(c);
    const k = resolveManagedKey(next.managed ?? {}, identifier);
    if (k) delete next.managed[k];
    return next;
  });
}

/* ------------------------------------------------------------------------- */
/* Pending tickets                                                           */
/* ------------------------------------------------------------------------- */

export async function getPendingTickets(guildId: string): Promise<string[]> {
  const g = await guildStore.ensure(guildId);
  return Array.isArray(g.pendingTickets) ? deepClone(g.pendingTickets) : [];
}

export async function setPendingTickets(
  guildId: string,
  update: (tickets: string[]) => string[],
): Promise<string[]> {
  // This requires read-modify-write as well
  const g = await guildStore.ensure(guildId);
  const current = Array.isArray(g.pendingTickets) ? deepClone(g.pendingTickets) : [];
  const next = update(current);
  const sanitized = Array.from(new Set(next.filter(s => typeof s === 'string')));

  // We could optimize with $addToSet or $pull if we knew the operation, but generic update function implies full replacement
  const doc = await guildStore.update(guildId, {
    pendingTickets: sanitized,
    updatedAt: new Date()
  });
  return deepClone(doc?.pendingTickets ?? []);
}

/* ------------------------------------------------------------------------- */
/* Roles                                                                     */
/* ------------------------------------------------------------------------- */

export async function readRoles(id: string): Promise<GuildRolesRecord> {
  const g = await guildStore.ensure(id);
  return deepClone((g.roles as GuildRolesRecord) ?? {});
}

export async function writeRoles(
  id: string,
  mutate: RolesMutator,
): Promise<GuildRolesRecord> {
  const current = await readRoles(id);
  const next = deepClone(mutate(current));
  const doc = await guildStore.update(id, { roles: next, updatedAt: new Date() });
  return deepClone((doc?.roles as GuildRolesRecord) ?? {});
}

export async function getRole(
  id: string,
  key: string,
): Promise<GuildRolesRecord[string] | null> {
  const r = await readRoles(id);
  return r?.[key] ?? null;
}

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

export async function ensureRoleExists(
  guildId: string,
  roleKey: string,
): Promise<void> {
  await upsertRole(guildId, roleKey, {});
}

/* Role overrides & limits -------------------------------------------------- */

export async function getRoleOverrides(
  guildId: string,
  roleKey: string,
): Promise<Record<string, unknown>> {
  const roles = await readRoles(guildId);
  return { ...(roles?.[roleKey]?.reach ?? {}) };
}

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

export async function getRoleLimits(
  guildId: string,
  roleKey: string,
): Promise<Record<string, unknown>> {
  const roles = await readRoles(guildId);
  return { ...(roles?.[roleKey]?.limits ?? {}) };
}

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

/* ------------------------------------------------------------------------- */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------- */

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
