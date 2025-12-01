/**
 * Motivación: centralizar operaciones sobre roles (index) para compartir límites y validaciones entre comandos.
 *
 * Idea/concepto: expone managers y rate limiters reutilizables para manipular roles sin violar restricciones de Discord.
 *
 * Alcance: helpers y orquestadores; no decide qué roles usar en cada flujo de negocio.
 */
import { roleRateLimiter } from "./rateLimiter";
import { getGuild } from "@/db/repositories/with_guild";
import {
  type RoleCommandOverride,
  type RoleLimitRecord,
} from "@/db/models/guild.schema";
import { isFeatureEnabled, Features } from "@/modules/features";

export type { RoleCommandOverride } from "@/db/models/guild.schema";

export interface RoleLimitUsage {
  roleKey: string;
  limit: RoleLimitRecord;
  windowSeconds: number;
  remaining: number;
  resetAt: number;
}

export interface RoleLimitBlock {
  roleKey: string;
  limit: RoleLimitRecord;
  windowSeconds: number;
  remaining: number;
  resetAt: number;
}

export type ConsumeLimitResult =
  | { allowed: true; applied: RoleLimitUsage[] }
  | { allowed: false; violation: RoleLimitBlock };

export interface ModerationActionDefinition {
  key: string;
  label: string;
}

export const DEFAULT_MODERATION_ACTIONS: readonly ModerationActionDefinition[] =
  Object.freeze([
    { key: "timeout", label: "Tiempo fuera" },
    { key: "kick", label: "Expulsion" },
    { key: "ban", label: "Baneo" },
    { key: "warn", label: "Advertencia" },
    { key: "purge", label: "Purgar" },
  ]);

export interface ResolveRoleActionPermissionInput {
  guildId: string;
  actionKey: string;
  memberRoleIds: readonly string[];
  hasDiscordPermission: boolean;
}

export interface ResolveRoleActionPermissionResult {
  allowed: boolean;
  decision:
  | "override-allow"
  | "override-deny"
  | "discord-allow"
  | "discord-deny";
  roleKey?: string;
  override?: RoleCommandOverride;
}

export interface ConsumeRoleLimitsOptions {
  guildId: string;
  actionKey: string;
  memberRoleIds: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Helpers to read role data from repo and normalize to snapshots      */
/* ------------------------------------------------------------------ */

export interface RoleSnapshot {
  key: string;
  label: string;
  discordRoleId: string | null;
  overrides: Record<string, RoleCommandOverride>;
  limits: Record<string, RoleLimitRecord>;
}

function normaliseAction(action: string): string {
  const trimmed = action.trim().toLowerCase();
  if (!trimmed) throw new Error("Debe proporcionar una clave de accion.");
  return trimmed.replace(/[\s-]+/g, "_");
}

function normaliseKey(k: string) {
  return normaliseAction(k);
}

export async function listGuildRoleSnapshots(guildId: string): Promise<RoleSnapshot[]> {
  const guild = await getGuild(guildId);
  const rolesObj = guild?.roles ?? {};
  const entries = Object.entries(rolesObj);
  return entries.map(([key, rec]: [string, any]) => {
    const overrides = (rec?.overrides ?? rec?.reach ?? {}) as Record<
      string,
      RoleCommandOverride
    >;
    const limits = (rec?.limits ?? {}) as Record<string, RoleLimitRecord>;
    const discordRoleId =
      rec?.discordRoleId ??
      rec?.discord_role_id ??
      rec?.discordId ??
      rec?.id ??
      null;

    // normalize action keys so lookups are stable
    const normOverrides: Record<string, RoleCommandOverride> = {};
    for (const [ok, ov] of Object.entries(overrides)) {
      normOverrides[normaliseKey(ok)] = ov as RoleCommandOverride;
    }
    const normLimits: Record<string, RoleLimitRecord> = {};
    for (const [lk, lv] of Object.entries(limits)) {
      normLimits[normaliseKey(lk)] = lv as RoleLimitRecord;
    }

    const label = typeof rec?.label === "string" ? rec.label : key;

    return {
      key,
      label,
      discordRoleId,
      overrides: normOverrides,
      limits: normLimits,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Public APIs                                                         */
/* ------------------------------------------------------------------ */

/**
 * Retorna una descripcion legible de la ventana de un limite.
 * Ex. "10 minutes", "1 hour", "no-window", "inherit"
 */
export function describeWindow(limit: RoleLimitRecord | undefined): string {
  if (!limit) return "inherit";
  const windowSeconds = limit.windowSeconds;
  if (!windowSeconds || windowSeconds <= 0) return "no-window";

  const match = limit.window?.match(/^(\d+)(m|h|d)$/);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case "m":
        return `${value} minute${value !== 1 ? "s" : ""}`;
      case "h":
        return `${value} hour${value !== 1 ? "s" : ""}`;
      case "d":
        return `${value} day${value !== 1 ? "s" : ""}`;
    }
  }
  return `${windowSeconds}s`;
}

/**
 * Determines whether a member can execute a moderation action given the roles
 * configured in the DB via repo.
 */
export async function resolveRoleActionPermission({
  guildId,
  actionKey,
  memberRoleIds,
  hasDiscordPermission,
}: ResolveRoleActionPermissionInput): Promise<ResolveRoleActionPermissionResult> {
  const rolesFeature = await isFeatureEnabled(guildId, Features.Roles);
  if (!rolesFeature) {
    return {
      allowed: hasDiscordPermission,
      decision: hasDiscordPermission ? "discord-allow" : "discord-deny",
    };
  }

  if (!memberRoleIds.length) {
    return {
      allowed: hasDiscordPermission,
      decision: hasDiscordPermission ? "discord-allow" : "discord-deny",
    };
  }

  const roles = await listGuildRoleSnapshots(guildId);
  const action = normaliseAction(actionKey);
  const membership = new Set(memberRoleIds);

  let allowSource:
    | { roleKey: string; override: RoleCommandOverride }
    | undefined;

  for (const snapshot of roles) {
    if (!snapshot.discordRoleId || !membership.has(snapshot.discordRoleId)) {
      continue;
    }

    const override = snapshot.overrides[action];
    if (!override || override === "inherit") continue;

    if (override === "deny") {
      return {
        allowed: false,
        decision: "override-deny",
        roleKey: snapshot.key,
        override,
      };
    }

    if (!allowSource) {
      allowSource = { roleKey: snapshot.key, override };
    }
  }

  if (allowSource) {
    return {
      allowed: true,
      decision: "override-allow",
      roleKey: allowSource.roleKey,
      override: allowSource.override,
    };
  }

  return {
    allowed: hasDiscordPermission,
    decision: hasDiscordPermission ? "discord-allow" : "discord-deny",
  };
}

/**
 * Applies configured rate limits for every managed role the member owns.
 * Returns either the applied buckets or the blocking constraint.
 */
export async function consumeRoleLimits({
  guildId,
  actionKey,
  memberRoleIds,
}: ConsumeRoleLimitsOptions): Promise<ConsumeLimitResult> {
  const rolesFeature = await isFeatureEnabled(guildId, Features.Roles);
  if (!rolesFeature) {
    return { allowed: true, applied: [] };
  }

  if (!memberRoleIds.length) {
    return { allowed: true, applied: [] };
  }

  const roles = await listGuildRoleSnapshots(guildId);
  const action = normaliseAction(actionKey);
  const membership = new Set(memberRoleIds);

  const consumed: Array<{
    key: string;
    roleKey: string;
    usage: RoleLimitUsage;
  }> = [];

  for (const snapshot of roles) {
    if (!snapshot.discordRoleId || !membership.has(snapshot.discordRoleId)) {
      continue;
    }

    const limit = snapshot.limits[action];
    if (!limit || !Number.isFinite(limit.limit) || limit.limit <= 0) continue;

    const windowSeconds = limit.windowSeconds;
    if (!windowSeconds || windowSeconds <= 0) continue;

    const bucketKey = `${guildId}:${snapshot.key}:${action}`;
    const outcome = roleRateLimiter.consume(
      bucketKey,
      Math.max(0, Math.floor(limit.limit)),
      windowSeconds,
    );

    if (!outcome.allowed) {
      for (const entry of consumed) roleRateLimiter.rollback(entry.key);

      return {
        allowed: false,
        violation: {
          roleKey: snapshot.key,
          limit,
          windowSeconds,
          remaining: outcome.remaining ?? 0,
          resetAt: outcome.resetAt ?? Date.now(),
        },
      };
    }

    consumed.push({
      key: bucketKey,
      roleKey: snapshot.key,
      usage: {
        roleKey: snapshot.key,
        limit,
        windowSeconds,
        remaining: outcome.remaining ?? 0,
        resetAt: outcome.resetAt ?? Date.now(),
      },
    });
  }

  return {
    allowed: true,
    applied: consumed.map((e) => e.usage),
  };
}

import { withGuild } from "@/db/repositories/with_guild";

export async function clearRoleLimit(
  guildId: string,
  roleKey: string,
  actionKey: string,
): Promise<void> {
  await withGuild(guildId, (guild) => {
    if (!guild.roles) return;
    const role = guild.roles[roleKey];
    if (!role || !role.limits) return;

    const action = normaliseAction(actionKey);
    delete role.limits[action];
  });
}

export async function getManagedRole(guildId: string, key: string): Promise<RoleSnapshot | null> {
  const roles = await listGuildRoleSnapshots(guildId);
  return roles.find(r => r.key === key) ?? null;
}

export async function resetRoleOverrides(guildId: string, roleKey: string): Promise<void> {
  await withGuild(guildId, (guild) => {
    if (!guild.roles?.[roleKey]) return;
    guild.roles[roleKey].reach = {};
  });
}

export async function getRoleOverrides(guildId: string, roleKey: string): Promise<Record<string, RoleCommandOverride>> {
  const guild = await getGuild(guildId);
  return (guild?.roles?.[roleKey]?.reach as Record<string, RoleCommandOverride>) ?? {};
}

export async function setRoleOverride(
  guildId: string,
  roleKey: string,
  actionKey: string,
  override: RoleCommandOverride
): Promise<void> {
  await withGuild(guildId, (guild) => {
    if (!guild.roles) guild.roles = {};
    if (!guild.roles[roleKey]) return; // Don't create if not exists
    if (!guild.roles[roleKey].reach) guild.roles[roleKey].reach = {};

    // Normalize action key
    const action = normaliseAction(actionKey);
    guild.roles[roleKey].reach[action] = override;
  });
}
