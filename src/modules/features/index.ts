/**
 * Motivación: declarar y habilitar características opcionales del bot en un catálogo central.
 *
 * Idea/concepto: lista features consumibles por otros módulos para condicionar comportamientos.
 *
 * Alcance: definición estática; no ejecuta lógica de cada feature.
 */
import { MessageFlags } from "seyfert/lib/types";

import {
  DEFAULT_GUILD_FEATURES,
  Features,
  type GuildFeaturesRecord,
} from "@/schemas/guild";
import {
  readFeatures as repoReadFeatures,
  setFeature as repoSetFeature,
  setAllFeatures as repoSetAllFeatures,
} from "@/db/repositories/guilds";

const CACHE_TTL_MS = 30_000;
const featureCache = new Map<
  string,
  { features: GuildFeaturesRecord; expiresAt: number }
>();

function cacheKey(guildId: string) {
  return guildId;
}

function setCache(guildId: string, features: GuildFeaturesRecord) {
  featureCache.set(cacheKey(guildId), {
    features,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function getCached(guildId: string): GuildFeaturesRecord | null {
  const entry = featureCache.get(cacheKey(guildId));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    featureCache.delete(cacheKey(guildId));
    return null;
  }
  return entry.features;
}

export { Features };
export { BindDisabled } from "./decorator";

export const GUILD_FEATURES: readonly Features[] = Object.values(Features);

export async function getFeatureFlags(
  guildId: string,
): Promise<GuildFeaturesRecord> {
  const cached = getCached(guildId);
  if (cached) return cached;
  const features = await repoReadFeatures(guildId);
  setCache(guildId, features);
  return features;
}

export async function isFeatureEnabled(
  guildId: string,
  feature: Features,
): Promise<boolean> {
  const features = await getFeatureFlags(guildId);
  const value = features[feature];
  return value === undefined ? DEFAULT_GUILD_FEATURES[feature] : value;
}

export async function setFeatureFlag(
  guildId: string,
  feature: Features,
  enabled: boolean,
): Promise<GuildFeaturesRecord> {
  const updated = await repoSetFeature(guildId, feature, enabled);
  setCache(guildId, updated);
  return updated;
}

export async function setAllFeatureFlags(
  guildId: string,
  enabled: boolean,
): Promise<GuildFeaturesRecord> {
  const updated = await repoSetAllFeatures(guildId, enabled);
  setCache(guildId, updated);
  return updated;
}

type WritableContext = {
  guildId?: string | null;
  write: (payload: any) => Promise<any>;
};

/**
 * Ensures a guild feature is enabled for the current context. When disabled,
 * sends an ephemeral notice and returns false so callers can bail out early.
 * 
 * @deprecated Use @BindDisabled decorator instead for commands.
 */
export async function assertFeatureEnabled(
  ctx: WritableContext,
  feature: Features,
  message?: string,
): Promise<boolean> {
  const guildId = ctx.guildId ?? undefined;
  if (!guildId) return true;

  const enabled = await isFeatureEnabled(guildId, feature);
  if (enabled) return true;

  await ctx.write({
    content:
      message ??
      "Esta característica está deshabilitada en este servidor. Un administrador puede habilitarla desde el dashboard.",
    flags: MessageFlags.Ephemeral,
  });
  return false;
}
