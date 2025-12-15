/**
 * Repositorio de guilds (servidores).
 *
 * Responsabilidad:
 * - Encapsular el acceso a la colección `guilds` (MongoDB).
 * - Validar/normalizar documentos con `GuildSchema` (Zod) en cada lectura/escritura.
 * - Proveer helpers específicos para secciones “anidadas” del documento (features, channels, roles, etc.).
 *
 * @remarks
 * El documento de guild suele evolucionar con el tiempo. Por eso existe una capa de
 * “sanitizado”/normalización que tolera documentos legacy (campos faltantes) y garantiza
 * shapes estables para los callers.
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

// Coerción defensiva: documentos legacy (sin secciones opcionales) deben parsear y tomar defaults.
const sanitizeGuildDoc = (doc: unknown): Record<string, unknown> => {
  const copy = { ...(doc as Record<string, unknown> | null | undefined) };

  if (copy.channels === undefined || copy.channels === null) {
    copy.channels = {};
  }
  if (copy.features === undefined || copy.features === null) {
    copy.features = {};
  }
  if (copy.roles === undefined || copy.roles === null) {
    copy.roles = {};
  }
  if (copy.pendingTickets === undefined || copy.pendingTickets === null) {
    copy.pendingTickets = [];
  }
  if (copy.reputation === undefined || copy.reputation === null) {
    copy.reputation = {};
  }

  return copy;
};

const defaultGuild = (id: GuildId): Guild =>
  parseGuild({
    _id: id,
    features: DEFAULT_GUILD_FEATURES,
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

// Acepta estructuras parciales desde DB y garantiza shapes estables para los callers.
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

// Punto único: parsea + normaliza cualquier payload de guild.
const parseGuild = (doc: unknown): Guild =>
  normalizeGuild(GuildSchema.parse(sanitizeGuildDoc(doc)));

const loadGuild = async (id: GuildId): Promise<Guild | null> => {
  const col = await guildsCollection();
  const doc = await col.findOne({ _id: id });
  return doc ? parseGuild(doc) : null;
};

// Replace (con upsert) tras revalidación; sella `updatedAt` y asegura `createdAt`.
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

/**
 * Obtiene una guild o la crea con defaults (y la persiste) si no existe.
 */
export const ensureGuild = async (id: GuildId): Promise<Guild> => {
  const existing = await loadGuild(id);
  if (existing) return existing;
  const next = defaultGuild(id);
  await saveGuildDocument(next);
  return next;
};

// Helper read-modify-write para que callers se enfoquen en mutaciones puras.
const mutateGuild = async (
  id: GuildId,
  mutator: (current: Guild) => Guild,
): Promise<Guild> => {
  const current = (await loadGuild(id)) ?? defaultGuild(id);
  return saveGuildDocument(mutator(current));
};

/** Lee una guild por id (normalizada) o `null` si no existe. */
export const getGuild = async (id: GuildId) => loadGuild(id);
/**
 * Aplica un patch y persiste la guild resultante.
 *
 * @remarks
 * El patch pasa por `GuildSchema` y por la capa de normalización.
 */
export const updateGuild = async (id: GuildId, patch: Partial<Guild>) =>
  mutateGuild(id, (g) => parseGuild({ ...g, ...patch, _id: id }));

/**
 * Aplica un `$set` por rutas (dot-notation) sin reescribir el documento completo.
 *
 * @remarks
 * Esto evita el problema de "last write wins" cuando distintos subsistemas actualizan
 * partes diferentes del documento de guild en paralelo (por ejemplo, configuraciones
 * en `channels.core` vs `features`).
 *
 * Además, repara defensivamente algunos campos legacy donde las secciones anidadas
 * podían ser `null`/faltantes (lo que rompería un `$set` con rutas).
 */
export async function updateGuildPaths(
  id: GuildId,
  paths: Record<string, unknown>,
  options: { unset?: string[] } = {},
): Promise<void> {
  const col = await guildsCollection();
  const now = new Date();

  const removals: Record<string, unknown> = {};
  for (const path of options.unset ?? []) {
    if (!path) continue;
    // `$$REMOVE` elimina el campo en una actualización por pipeline.
    removals[path] = "$$REMOVE";
  }

  const pipeline = [
    {
      $set: {
        createdAt: { $ifNull: ["$createdAt", now] },
        channels: {
          $cond: [
            { $eq: [{ $type: "$channels" }, "object"] },
            "$channels",
            {},
          ],
        },
        features: {
          $cond: [
            { $eq: [{ $type: "$features" }, "object"] },
            "$features",
            {},
          ],
        },
        reputation: {
          $cond: [
            { $eq: [{ $type: "$reputation" }, "object"] },
            "$reputation",
            {},
          ],
        },
        roles: {
          $cond: [{ $eq: [{ $type: "$roles" }, "object"] }, "$roles", {}],
        },
      },
    },
    {
      $set: {
        "channels.core": {
          $cond: [
            { $eq: [{ $type: "$channels.core" }, "object"] },
            "$channels.core",
            {},
          ],
        },
        "channels.managed": {
          $cond: [
            { $eq: [{ $type: "$channels.managed" }, "object"] },
            "$channels.managed",
            {},
          ],
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

  await col.updateOne({ _id: id }, pipeline as any, { upsert: true });
}
/** Elimina una guild; retorna `true` si se borró un documento. */
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

/**
 * Activa o desactiva un feature flag.
 *
 * @returns El set completo de features (con defaults aplicados).
 */
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

/**
 * Habilita/deshabilita todos los features conocidos.
 */
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

/**
 * Aplica una mutación determinística sobre `channels` y persiste el resultado.
 *
 * @param mutate Función pura que recibe el snapshot actual y devuelve el próximo.
 * @returns La estructura de channels normalizada resultante.
 */
export async function writeChannels(
  guildID: GuildId,
  mutate: (current: GuildChannelsRecord) => GuildChannelsRecord,
): Promise<GuildChannelsRecord> {
  // Corremos la mutación sobre un snapshot clonado para evitar efectos colaterales fuera del repo.
  const current = await readChannels(guildID);
  const next = deepClone(mutate(current));
  const doc = await mutateGuild(guildID, (g) => ({
    ...g,
    channels: next,
    updatedAt: new Date(),
  }));
  return normalizeChannels(doc.channels ?? {});
}

/**
 * Setea un canal “core” (welcome, logs, tickets, etc.).
 *
 * @param name Nombre lógico del canal dentro de `channels.core`.
 * @param channelId Id del canal de Discord.
 */
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

/**
 * Obtiene un canal “core” por nombre o `null` si no está configurado.
 */
export async function getCoreChannel(
  id: GuildId,
  name: string,
): Promise<CoreChannelRecord | null> {
  const c = await readChannels(id);
  const core = c?.core;
  if (!core) return null;
  return (core[name as keyof typeof core] as CoreChannelRecord | null) ?? null;
}

/** Setea/limpia la categoría donde se crean tickets. */
export async function setTicketCategory(
  id: GuildId,
  categoryId: string | null,
): Promise<GuildChannelsRecord> {
  return writeChannels(id, (c) => ({
    ...c,
    ticketCategoryId: categoryId,
  } as any));
}

/** Setea/limpia el messageId del mensaje “panel” de tickets. */
export async function setTicketMessage(
  id: GuildId,
  messageId: string | null,
): Promise<GuildChannelsRecord> {
  return writeChannels(id, (c) => ({ ...c, ticketMessageId: messageId }));
}

/* Managed channels -------------------------------------------------------- */

/**
 * Lista los canales “managed” (estructura libre para features que gestionan canales).
 */
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

/**
 * Actualiza un managed channel por id o label.
 *
 * @remarks
 * Aceptar `label` como identificador ayuda con UX en comandos, pero el id interno (`key`) es el
 * identificador canónico persistido.
 */
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

/**
 * Elimina un managed channel por id o label.
 */
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

/**
 * Actualiza la lista de tickets pendientes mediante una función `update`.
 *
 * @remarks
 * Deduplica y filtra valores inválidos antes de persistir.
 */
export async function setPendingTickets(
  guildId: GuildId,
  update: (tickets: string[]) => string[],
): Promise<string[]> {
  const g = await ensureGuild(guildId);
  const current = Array.isArray(g.pendingTickets) ? deepClone(g.pendingTickets) : [];
  const next = update(current);
  // Deduplica + elimina inválidos antes de persistir para evitar datos “sucios”.
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

/**
 * Aplica una mutación determinística sobre `roles` y persiste el resultado.
 *
 * @param mutate Función pura que recibe el snapshot actual y devuelve el próximo.
 */
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

/**
 * Upsert de un rol por `key`, aplicando un patch y sellando `updatedAt` (string ISO).
 *
 * @remarks
 * El shape interno de cada role es flexible (`any`) porque distintos sistemas guardan
 * metadatos diferentes.
 */
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

/**
 * Elimina un rol (por key) del registro persistido.
 */
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

/**
 * Devuelve el mapa de overrides (reach) para un role.
 */
export async function getRoleOverrides(
  guildId: string,
  roleKey: string,
): Promise<Record<string, unknown>> {
  const roles = await readRoles(guildId);
  return { ...(roles?.[roleKey]?.reach ?? {}) };
}

/**
 * Setea un override para una acción.
 *
 * @param actionKey Se normaliza a `snake_case` para estabilidad.
 */
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

/**
 * Elimina un override; retorna `true` si realmente se removió.
 */
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

/**
 * Resetea todos los overrides (reach) para un role.
 */
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

/**
 * Devuelve el mapa de límites (limits) para un role.
 */
export async function getRoleLimits(
  guildId: GuildId,
  roleKey: string,
): Promise<Record<string, unknown>> {
  const roles = await readRoles(guildId);
  return { ...(roles?.[roleKey]?.limits ?? {}) };
}

/**
 * Setea un límite para una acción.
 *
 * @remarks
 * Se guardan tanto `window` (string) como `windowSeconds` (number) porque hay callers legacy
 * que usan distintas representaciones.
 */
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

/**
 * Elimina un límite; retorna `true` si realmente se removió.
 */
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
