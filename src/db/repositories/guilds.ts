import { normalizeStringArray } from "@/db/normalizers";
import { deepClone } from "@/db/helpers";
import { type Guild, GuildSchema } from "@/db/schemas/guild";
import {
  Features,
  type GuildChannelsRecord,
  type GuildFeaturesRecord,
  type ManagedChannelRecord,
} from "@/db/schemas/guild";
import type { GuildId } from "@/db/types";
import { MongoStore } from "../mongo-store";
import { GuildRolesRepo } from "./guild-roles";

/**
 * Guilds Repository: Validated access + path helpers for channels/tickets.
 *
 * Context: Base layer for configuration, channel, and ticket modules. We delegate
 * validation to `MongoStore` (Zod) and expose helpers that manipulate sub-paths
 * without rebuilding the full document.
 */
export const GuildStore = new MongoStore<Guild>("guilds", GuildSchema);

/**
 * Applies point patches on paths (`dot-notation`) or defensive pipelines.
 *
 * Purpose: Update subdocuments without overwriting the entire guild.
 * Invariants: Ensures empty objects in critical fields before applying
 * `paths`, avoids `null`/incorrect types in `channels|features|ai|roles`.
 * Gotchas: If a `pipeline` is passed, `updatedAt` is NOT updated automatically;
 * the pipeline must handle it. Uses `$$REMOVE` for unsets when provided.
 */
export async function updateGuildPaths(
  id: GuildId,
  paths: Record<string, unknown>,
  options: { unset?: string[] } = {},
): Promise<void> {
  const now = new Date();
  const removals: Record<string, unknown> = {};
  for (const path of options.unset ?? []) {
    if (path) removals[path] = "$$REMOVE";
  }

  const pipeline = [
    {
      $set: {
        createdAt: { $ifNull: ["$createdAt", now] },
        channels: {
          $cond: [{ $eq: [{ $type: "$channels" }, "object"] }, "$channels", {}],
        },
        features: {
          $cond: [{ $eq: [{ $type: "$features" }, "object"] }, "$features", {}],
        },
        reputation: {
          $cond: [
            { $eq: [{ $type: "$reputation" }, "object"] },
            "$reputation",
            {},
          ],
        },
        forumAutoReply: {
          $cond: [
            { $eq: [{ $type: "$forumAutoReply" }, "object"] },
            "$forumAutoReply",
            {},
          ],
        },
        automod: {
          $cond: [{ $eq: [{ $type: "$automod" }, "object"] }, "$automod", {}],
        },
        ai: { $cond: [{ $eq: [{ $type: "$ai" }, "object"] }, "$ai", {}] },
        roles: {
          $cond: [{ $eq: [{ $type: "$roles" }, "object"] }, "$roles", {}],
        },
      },
    },
    {
      $set: {
        ...paths,
        ...removals,
        updatedAt: now,
      },
    },
  ];

  await GuildStore.updatePaths(
    id,
    {},
    { upsert: true, pipeline: pipeline as any },
  );
}

/* ------------------------------------------------------------------------- */
/* Tickets                                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Returns the normalized list of pending tickets (unique strings).
 * Side effects: Ensures the guild document exists.
 */
export async function getPendingTickets(id: GuildId): Promise<string[]> {
  const g = await GuildStore.ensure(id);
  return normalizeStringArray(g.unwrap()?.pendingTickets);
}

/**
 * Applies a transformation function to the pending array and persists it.
 * Guarantees uniqueness and string type; returns the new normalized value.
 */
export async function setPendingTickets(
  id: GuildId,
  update: (tickets: string[]) => string[],
): Promise<string[]> {
  const current = await getPendingTickets(id);
  const next = Array.from(
    new Set(update(current).filter((s) => typeof s === "string")),
  );
  const res = await GuildStore.patch(id, { pendingTickets: next } as any);
  return normalizeStringArray(res.unwrap()?.pendingTickets);
}

const normActionKey = (k: string) =>
  k
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

export async function ensureGuild(id: GuildId): Promise<Guild> {
  const res = await GuildStore.ensure(id);
  if (res.isErr()) throw res.error;
  return res.unwrap();
}

export async function getGuild(id: GuildId): Promise<Guild | null> {
  const res = await GuildStore.get(id);
  if (res.isErr()) throw res.error;
  return res.unwrap();
}

export async function updateGuild(
  id: GuildId,
  patch: Partial<Guild>,
): Promise<Guild> {
  const res = await GuildStore.patch(id, patch);
  if (res.isErr()) throw res.error;
  return res.unwrap();
}

export async function deleteGuild(id: GuildId): Promise<boolean> {
  const res = await GuildStore.delete(id);
  if (res.isErr()) throw res.error;
  return res.unwrap();
}

export async function readFeatures(id: GuildId): Promise<GuildFeaturesRecord> {
  const guild = await ensureGuild(id);
  return deepClone(guild.features as GuildFeaturesRecord);
}

export async function setFeature(
  id: GuildId,
  feature: Features,
  enabled: boolean,
): Promise<GuildFeaturesRecord> {
  await updateGuildPaths(id, { [`features.${feature}`]: Boolean(enabled) });
  return readFeatures(id);
}

export async function setAllFeatures(
  id: GuildId,
  enabled: boolean,
): Promise<GuildFeaturesRecord> {
  const current = await readFeatures(id);
  const next: Record<string, boolean> = { ...current };
  for (const key of Object.values(Features)) {
    next[key] = Boolean(enabled);
  }
  const res = await GuildStore.patch(id, { features: next } as any);
  if (res.isErr()) throw res.error;
  return deepClone(res.unwrap().features as GuildFeaturesRecord);
}

export async function readChannels(id: GuildId): Promise<GuildChannelsRecord> {
  const guild = await ensureGuild(id);
  return deepClone(guild.channels as GuildChannelsRecord);
}

export async function writeChannels(
  id: GuildId,
  mutate: (current: GuildChannelsRecord) => GuildChannelsRecord,
): Promise<GuildChannelsRecord> {
  const current = await readChannels(id);
  const next = deepClone(mutate(current));

  const roles = Array.isArray((next as any).ticketHelperRoles)
    ? (next as any).ticketHelperRoles
    : [];
  const hasInvalid = roles.some((r: unknown) => typeof r !== "string");
  (next as any).ticketHelperRoles = hasInvalid
    ? []
    : Array.from(new Set(roles));

  const res = await GuildStore.patch(id, { channels: next } as any);
  if (res.isErr()) throw res.error;
  return deepClone(res.unwrap().channels as GuildChannelsRecord);
}

export async function getCoreChannel(
  id: GuildId,
  name: string,
): Promise<{ channelId: string } | null> {
  const channels = await readChannels(id);
  const core = (channels.core ?? {}) as Record<
    string,
    { channelId: string } | null
  >;
  return core[name] ?? null;
}

export async function setCoreChannel(
  id: GuildId,
  name: string,
  channelId: string,
): Promise<{ channelId: string }> {
  const record = { channelId };
  await updateGuildPaths(id, { [`channels.core.${name}`]: record });
  return record;
}

export async function setTicketCategory(
  id: GuildId,
  categoryId: string,
): Promise<GuildChannelsRecord> {
  await updateGuildPaths(id, { "channels.ticketCategoryId": categoryId });
  return readChannels(id);
}

export async function setTicketMessage(
  id: GuildId,
  messageId: string,
): Promise<GuildChannelsRecord> {
  await updateGuildPaths(id, { "channels.ticketMessageId": messageId });
  return readChannels(id);
}

export async function listManagedChannels(
  id: GuildId,
): Promise<ManagedChannelRecord[]> {
  const channels = await readChannels(id);
  const managed = (channels.managed ?? {}) as Record<
    string,
    ManagedChannelRecord
  >;
  return Object.values(managed).filter(Boolean);
}

export async function addManagedChannel(
  id: GuildId,
  input: { label: string; channelId: string },
): Promise<ManagedChannelRecord> {
  const record: ManagedChannelRecord = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    label: input.label,
    channelId: input.channelId,
  };
  await updateGuildPaths(id, { [`channels.managed.${record.id}`]: record });
  return record;
}

export async function updateManagedChannel(
  id: GuildId,
  identifier: string,
  patch: Partial<Pick<ManagedChannelRecord, "label" | "channelId">>,
): Promise<ManagedChannelRecord | null> {
  const channels = await readChannels(id);
  const managed = (channels.managed ?? {}) as Record<
    string,
    ManagedChannelRecord
  >;
  const entry = managed[identifier]
    ? [identifier, managed[identifier]]
    : Object.entries(managed).find(([, v]) => v?.label === identifier);
  if (!entry) return null;

  const [key, current] = entry as [string, ManagedChannelRecord];
  const next: ManagedChannelRecord = {
    ...current,
    ...(patch.label !== undefined ? { label: patch.label } : {}),
    ...(patch.channelId !== undefined ? { channelId: patch.channelId } : {}),
  };
  await updateGuildPaths(id, { [`channels.managed.${key}`]: next });
  return next;
}

export async function removeManagedChannel(
  id: GuildId,
  identifier: string,
): Promise<boolean> {
  const channels = await readChannels(id);
  const managed = (channels.managed ?? {}) as Record<
    string,
    ManagedChannelRecord
  >;
  const key = managed[identifier]
    ? identifier
    : Object.entries(managed).find(([, v]) => v?.label === identifier)?.[0];
  if (!key) return false;
  await updateGuildPaths(id, {}, { unset: [`channels.managed.${key}`] });
  return true;
}

export async function readRoles(id: GuildId): Promise<Record<string, any>> {
  const res = await GuildRolesRepo.read(id);
  if (res.isErr()) throw res.error;
  return res.unwrap() as any;
}

export async function writeRoles(
  id: GuildId,
  mutate: (current: Record<string, any>) => Record<string, any>,
): Promise<Record<string, any>> {
  const res = await GuildRolesRepo.write(id, mutate as any);
  if (res.isErr()) throw res.error;
  return res.unwrap() as any;
}

export async function getRole(id: GuildId, key: string): Promise<any | null> {
  const roles = await readRoles(id);
  return roles?.[key] ?? null;
}

export async function ensureRoleExists(
  id: GuildId,
  key: string,
): Promise<void> {
  await writeRoles(id, (current) => {
    if (current?.[key]) return current;
    return {
      ...current,
      [key]: {
        label: key,
        discordRoleId: null,
        limits: {},
        reach: {},
        updatedBy: null,
        updatedAt: null,
      },
    };
  });
}

export async function updateRole(
  id: GuildId,
  key: string,
  patch: any,
): Promise<Record<string, any>> {
  const res = await GuildRolesRepo.update(id, key, patch);
  if (res.isErr()) throw res.error;
  return res.unwrap() as any;
}

export async function removeRole(
  id: GuildId,
  key: string,
): Promise<Record<string, any>> {
  const res = await GuildRolesRepo.remove(id, key);
  if (res.isErr()) throw res.error;
  return res.unwrap() as any;
}

export async function setRoleOverride(
  id: GuildId,
  roleKey: string,
  actionKey: string,
  override: any,
): Promise<void> {
  const res = await GuildRolesRepo.setOverride(
    id,
    roleKey,
    actionKey,
    override,
  );
  if (res.isErr()) throw res.error;
}

export async function getRoleOverrides(
  id: GuildId,
  roleKey: string,
): Promise<Record<string, any>> {
  const role = await getRole(id, roleKey);
  return deepClone((role?.reach ?? {}) as Record<string, any>);
}

export async function clearRoleOverride(
  id: GuildId,
  roleKey: string,
  actionKey: string,
): Promise<boolean> {
  const normalized = normActionKey(actionKey);
  const before = await getRoleOverrides(id, roleKey);
  if (!(normalized in before)) return false;

  await writeRoles(id, (current) => {
    const role = current?.[roleKey];
    if (!role) return current;
    const reach = { ...(role?.reach ?? {}) };
    delete reach[normalized];
    return {
      ...current,
      [roleKey]: {
        ...role,
        reach,
        updatedAt: new Date().toISOString(),
      },
    };
  });
  return true;
}

export async function resetRoleOverrides(
  id: GuildId,
  roleKey: string,
): Promise<void> {
  await writeRoles(id, (current) => {
    const role = current?.[roleKey];
    if (!role) return current;
    return {
      ...current,
      [roleKey]: {
        ...role,
        reach: {},
        updatedAt: new Date().toISOString(),
      },
    };
  });
}

export async function setRoleLimit(
  id: GuildId,
  roleKey: string,
  actionKey: string,
  limit: {
    limit: number;
    window?: string | null;
    windowSeconds?: number | null;
  },
): Promise<void> {
  const res = await GuildRolesRepo.setLimit(id, roleKey, actionKey, limit);
  if (res.isErr()) throw res.error;
}

export async function getRoleLimits(
  id: GuildId,
  roleKey: string,
): Promise<Record<string, any>> {
  const role = await getRole(id, roleKey);
  return deepClone((role?.limits ?? {}) as Record<string, any>);
}

export async function clearRoleLimit(
  id: GuildId,
  roleKey: string,
  actionKey: string,
): Promise<boolean> {
  const normalized = normActionKey(actionKey);
  const before = await getRoleLimits(id, roleKey);
  if (!(normalized in before)) return false;

  await writeRoles(id, (current) => {
    const role = current?.[roleKey];
    if (!role) return current;
    const limits = { ...(role?.limits ?? {}) };
    delete limits[normalized];
    return {
      ...current,
      [roleKey]: {
        ...role,
        limits,
        updatedAt: new Date().toISOString(),
      },
    };
  });
  return true;
}
