/**
 * Guild repository using native Mongo driver and Zod validation.
 * Purpose: expose guild persistence operations with normalized/defaulted data, hiding Mongo specifics.
 */
import { getDb } from "@/db/mongo";
import {
  GuildSchema,
  type Guild,
  type GuildChannelsRecord,
  type GuildFeaturesRecord,
  type GuildRolesRecord,
  type ManagedChannelRecord,
  type CoreChannelRecord,
  Features,
  DEFAULT_GUILD_FEATURES,
} from "@/db/schemas/guild";
import { normalizeStringArray } from "@/db/normalizers";
import type { GuildId } from "@/db/types";
import { deepClone } from "@/db/helpers";

const guildsCollection = async () => (await getDb()).collection<Guild>("guilds");

const defaultGuild = (id: GuildId): Guild =>
  GuildSchema.parse({
    _id: id,
    features: DEFAULT_GUILD_FEATURES,
    channels: undefined, // let schema defaults apply
    roles: {},
    pendingTickets: [],
    reputation: { keywords: [] },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const mergeFeatures = (features: GuildFeaturesRecord | null | undefined): GuildFeaturesRecord => ({
  ...DEFAULT_GUILD_FEATURES,
  ...(features ?? {}),
});

const normalizeChannels = (channels: Partial<GuildChannelsRecord>): GuildChannelsRecord => {
  const core =
    channels.core ??
    ({
      welcome: null,
      goodbye: null,
      logs: null,
      reports: null,
      suggestions: null,
      tickets: null,
    } as Record<string, CoreChannelRecord | null>);

  return {
    core,
    managed: channels.managed ?? {},
    ticketMessageId:
      typeof channels.ticketMessageId === "string" || channels.ticketMessageId === null
        ? channels.ticketMessageId
        : null,
    ticketHelperRoles: normalizeStringArray((channels as any).ticketHelperRoles ?? []),
    ticketCategoryId:
      typeof channels.ticketCategoryId === "string" || channels.ticketCategoryId === null
        ? channels.ticketCategoryId
        : null,
  } as GuildChannelsRecord;
};

const normalizeGuild = (doc: Guild): Guild => ({
  ...doc,
  roles: (doc.roles as GuildRolesRecord) ?? {},
  channels: normalizeChannels(doc.channels as Partial<GuildChannelsRecord>),
  features: mergeFeatures(doc.features as GuildFeaturesRecord),
  pendingTickets: normalizeStringArray(doc.pendingTickets),
  reputation: doc.reputation ?? { keywords: [] },
});

const parseGuild = (doc: unknown): Guild => normalizeGuild(GuildSchema.parse(doc));

const loadGuild = async (id: GuildId): Promise<Guild | null> => {
  const col = await guildsCollection();
  const doc = await col.findOne({ _id: id });
  return doc ? parseGuild(doc) : null;
};

const saveGuildDocument = async (guild: Guild): Promise<Guild> => {
  const col = await guildsCollection();
  const now = new Date();
  const parsed = parseGuild({
    ...guild,
    updatedAt: now,
    createdAt: guild.createdAt ?? now,
  });
  await col.replaceOne({ _id: parsed._id }, parsed, { upsert: true });
  return parsed;
};

export const ensureGuild = async (id: GuildId): Promise<Guild> => {
  const existing = await loadGuild(id);
  if (existing) return existing;
  const next = defaultGuild(id);
  await saveGuildDocument(next);
  return next;
};

const mutateGuild = async (
  id: GuildId,
  mutator: (current: Guild) => Guild,
): Promise<Guild> => {
  const current = (await loadGuild(id)) ?? defaultGuild(id);
  return saveGuildDocument(mutator(current));
};

export const getGuild = async (id: GuildId) => loadGuild(id);
export const updateGuild = async (id: GuildId, patch: Partial<Guild>) =>
  mutateGuild(id, (g) => parseGuild({ ...g, ...patch, _id: id }));
export const deleteGuild = async (id: GuildId) => {
  const col = await guildsCollection();
  const res = await col.deleteOne({ _id: id });
  return (res.deletedCount ?? 0) > 0;
};

/* ------------------------------------------------------------------------- */
/* Feature flags                                                             */
/* ------------------------------------------------------------------------- */

export async function readFeatures(id: GuildId): Promise<GuildFeaturesRecord> {
  const g = await ensureGuild(id);
  return mergeFeatures(g.features as GuildFeaturesRecord);
}

export async function setFeature(
  id: GuildId,
  feature: Features,
  enabled: boolean,
): Promise<GuildFeaturesRecord> {
  const doc = await mutateGuild(id, (g) => ({
    ...g,
    features: { ...mergeFeatures(g.features), [feature]: enabled },
    updatedAt: new Date(),
  }));
  return mergeFeatures(doc.features);
}

export async function setAllFeatures(
  id: GuildId,
  enabled: boolean,
): Promise<GuildFeaturesRecord> {
  const doc = await mutateGuild(id, (g) => ({
    ...g,
    features: Object.keys(DEFAULT_GUILD_FEATURES).reduce(
      (acc, key) => ({ ...acc, [key]: enabled }),
      mergeFeatures(g.features),
    ),
    updatedAt: new Date(),
  }));
  return mergeFeatures(doc.features);
}

/* ------------------------------------------------------------------------- */
/* Channels                                                                  */
/* ------------------------------------------------------------------------- */

export async function readChannels(id: GuildId): Promise<GuildChannelsRecord> {
  const g = await ensureGuild(id);
  return normalizeChannels(deepClone(g.channels ?? {}) as Partial<GuildChannelsRecord>);
}

export async function writeChannels(
  guildID: GuildId,
  mutate: (current: GuildChannelsRecord) => GuildChannelsRecord,
): Promise<GuildChannelsRecord> {
  const current = await readChannels(guildID);
  const next = deepClone(mutate(current));
  const doc = await mutateGuild(guildID, (g) => ({
    ...g,
    channels: next,
    updatedAt: new Date(),
  }));
  return normalizeChannels(doc.channels ?? {});
}

export async function setCoreChannel(
  id: GuildId,
  name: string,
  channelId: string,
): Promise<GuildChannelsRecord> {
  return writeChannels(id, (c) => {
    const next = deepClone(c);
    next.core = next.core ?? {};
    next.core[name] = { channelId } as CoreChannelRecord;
    return next;
  });
}

export async function getCoreChannel(
  id: GuildId,
  name: string,
): Promise<CoreChannelRecord | null> {
  const c = await readChannels(id);
  const core = c?.core;
  if (!core) return null;
  return (core[name as keyof typeof core] as CoreChannelRecord | null) ?? null;
}

export async function setTicketCategory(
  id: GuildId,
  categoryId: string | null,
): Promise<GuildChannelsRecord> {
  return writeChannels(id, (c) => ({
    ...c,
    ticketCategoryId: categoryId,
  } as any));
}

export async function setTicketMessage(
  id: GuildId,
  messageId: string | null,
): Promise<GuildChannelsRecord> {
  return writeChannels(id, (c) => ({ ...c, ticketMessageId: messageId }));
}

/* Managed channels -------------------------------------------------------- */

export async function listManagedChannels(id: GuildId): Promise<ManagedChannelRecord[]> {
  const c = await readChannels(id);
  return Object.values(c.managed ?? {}) as ManagedChannelRecord[];
}

const generateKey = (label: string, existing: string[]): string => {
  let base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (!base) base = "channel";
  let candidate = base;
  let counter = 1;
  while (existing.includes(candidate)) {
    candidate = `${base}-${counter++}`;
  }
  return candidate;
};

const resolveManagedKey = (
  map: Record<string, any>,
  identifier: string,
): string | null => {
  if (map[identifier]) return identifier;
  const found = Object.values(map).find(
    (entry: any) => entry.label === identifier || entry.id === identifier,
  );
  return found ? (found as any).id : null;
};

export async function addManagedChannel(
  id: GuildId,
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
  id: GuildId,
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
  guildID: GuildId,
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

export async function getPendingTickets(guildId: GuildId): Promise<string[]> {
  const g = await ensureGuild(guildId);
  return normalizeStringArray(g.pendingTickets);
}

export async function setPendingTickets(
  guildId: GuildId,
  update: (tickets: string[]) => string[],
): Promise<string[]> {
  const g = await ensureGuild(guildId);
  const current = Array.isArray(g.pendingTickets) ? deepClone(g.pendingTickets) : [];
  const next = update(current);
  const sanitized = Array.from(new Set(next.filter((s) => typeof s === "string")));
  const doc = await mutateGuild(guildId, (guild) => ({
    ...guild,
    pendingTickets: sanitized,
    updatedAt: new Date(),
  }));
  return normalizeStringArray(doc.pendingTickets);
}

/* ------------------------------------------------------------------------- */
/* Roles                                                                     */
/* ------------------------------------------------------------------------- */

export async function readRoles(id: GuildId): Promise<GuildRolesRecord> {
  const g = await ensureGuild(id);
  return deepClone((g.roles as GuildRolesRecord) ?? {});
}

export async function writeRoles(
  id: GuildId,
  mutate: (current: GuildRolesRecord) => GuildRolesRecord,
): Promise<GuildRolesRecord> {
  const current = await readRoles(id);
  const next = deepClone(mutate(current));
  const doc = await mutateGuild(id, (g) => ({
    ...g,
    roles: next,
    updatedAt: new Date(),
  }));
  return deepClone((doc?.roles as GuildRolesRecord) ?? {});
}

export async function getRole(
  id: GuildId,
  key: string,
): Promise<GuildRolesRecord[string] | null> {
  const r = await readRoles(id);
  return r?.[key] ?? null;
}

export async function updateRole(
  id: GuildId,
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
  id: GuildId,
  key: string,
): Promise<GuildRolesRecord> {
  return writeRoles(id, (r) => {
    if (!r?.[key]) return r;
    const { [key]: _omit, ...rest } = r;
    return rest;
  });
}

export async function ensureRoleExists(
  guildId: GuildId,
  roleKey: string,
): Promise<void> {
  await updateRole(guildId, roleKey, {});
}

/* Role overrides & limits -------------------------------------------------- */

const normAction = (k: string) => k.trim().toLowerCase().replace(/[\s-]+/g, "_");

export async function getRoleOverrides(
  guildId: string,
  roleKey: string,
): Promise<Record<string, unknown>> {
  const roles = await readRoles(guildId);
  return { ...(roles?.[roleKey]?.reach ?? {}) };
}

export async function setRoleOverride(
  guildId: GuildId,
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
  guildId: GuildId,
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
  guildId: GuildId,
  roleKey: string,
): Promise<void> {
  await writeRoles(guildId, (roles: any = {}) => {
    const ex = roles[roleKey] ?? {};
    roles[roleKey] = { ...ex, reach: {}, updatedAt: new Date().toISOString() };
    return roles;
  });
}

export async function getRoleLimits(
  guildId: GuildId,
  roleKey: string,
): Promise<Record<string, unknown>> {
  const roles = await readRoles(guildId);
  return { ...(roles?.[roleKey]?.limits ?? {}) };
}

export async function setRoleLimit(
  guildId: GuildId,
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
  guildId: GuildId,
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
