/**
 * Feature flags service.
 *
 * Role in system:
 * - Central API to read/write feature toggles for a guild.
 * - Used by middlewares and listeners to gate behavior.
 *
 * Dependencies:
 * - `configStore` for persistence and caching.
 * - `DEFAULT_GUILD_FEATURES` as baseline behavior.
 *
 * Invariants:
 * - Stored config is partial; missing keys fall back to defaults (usually true).
 * - Public API never throws; it returns safe defaults.
 *
 * Gotchas:
 * - All toggles are persisted under the `features` config key.
 * - Defaults are applied here, not in the config schema.
 */

import { MessageFlags } from "seyfert/lib/types";

import {
  DEFAULT_GUILD_FEATURES,
  Features,
  type GuildFeaturesRecord,
} from "@/db/schemas/guild";

import { configStore, ConfigurableModule } from "@/configuration";

export { Features };
export { BindDisabled } from "./decorator";

export const GUILD_FEATURES: readonly Features[] = Object.values(Features);

/**
 * Read the full feature set for a guild.
 *
 * @returns Features with defaults applied.
 * @sideEffects Reads config via ConfigStore (cached).
 * @errors None thrown; defaults are returned if anything fails.
 */
export async function getFeatureFlags(
  guildId: string,
): Promise<GuildFeaturesRecord> {
  const stored = await configStore.get(guildId, ConfigurableModule.Features);
  // WHY: defaults live here so new feature flags default to "enabled" unless set.
  return { ...DEFAULT_GUILD_FEATURES, ...(stored ?? {}) };
}

/**
 * Check if a specific feature is enabled for the guild.
 *
 * @returns `true` if enabled or missing (defaults to enabled).
 * @sideEffects Reads config via ConfigStore (cached).
 * @errors None thrown.
 */
export async function isFeatureEnabled(
  guildId: string,
  feature: Features,
): Promise<boolean> {
  const features = await getFeatureFlags(guildId);
  const value = features[feature];
  return value === undefined || value === null
    ? DEFAULT_GUILD_FEATURES[feature]
    : Boolean(value);
}

/**
 * Enable/disable a single feature flag.
 *
 * @param feature Feature enum value.
 * @param enabled Desired state.
 * @returns Updated feature set with defaults applied.
 * @sideEffects Writes config (Mongo) and updates cache.
 * @errors None thrown; failures log and return best-effort data.
 */
export async function setFeatureFlag(
  guildId: string,
  feature: Features,
  enabled: boolean,
): Promise<GuildFeaturesRecord> {
  await configStore.set(guildId, ConfigurableModule.Features, {
    [feature]: enabled,
  } as Partial<GuildFeaturesRecord>);
  return getFeatureFlags(guildId);
}

/**
 * Enable/disable all known feature flags.
 *
 * @returns Updated feature set with defaults applied.
 * @sideEffects Writes config (Mongo) and updates cache.
 * @errors None thrown; failures log and return best-effort data.
 */
export async function setAllFeatureFlags(
  guildId: string,
  enabled: boolean,
): Promise<GuildFeaturesRecord> {
  const updates: Partial<GuildFeaturesRecord> = {};
  for (const key of GUILD_FEATURES) {
    updates[key] = enabled;
  }

  await configStore.set(guildId, ConfigurableModule.Features, updates);
  return getFeatureFlags(guildId);
}

type WritableContext = {
  guildId?: string | null;
  write: (payload: any) => Promise<any>;
};

/**
 * Guard helper for components/handlers that are not covered by middleware.
 *
 * @deprecated Use @BindDisabled decorator instead for commands.
 * @returns `true` when enabled; `false` after sending an ephemeral notice.
 * @sideEffects Sends an ephemeral message when disabled.
 * @errors None thrown.
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
      "Esta caracteristica esta deshabilitada en este servidor. Un administrador puede habilitarla desde el dashboard.",
    flags: MessageFlags.Ephemeral,
  });
  return false;
}
