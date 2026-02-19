/**
 * Role Shared Utilities.
 *
 * Purpose: Shared helpers and common logic for moderation role management.
 */
import type { GuildCommandContext } from "seyfert";

import { GuildStore } from "@/db/repositories/guilds";
import {
  DEFAULT_MODERATION_ACTIONS,
  type ModerationActionDefinition,
} from "@/modules/guild-roles"; // only for constants/types
import { Features, isFeatureEnabled } from "@/modules/features";
import type {
  LimitWindow,
  RoleCommandOverride,
  RoleLimitRecord,
} from "@/db/schemas/guild";
import {
  GUILD_ONLY_MESSAGE,
  requireGuildPermission,
} from "@/utils/commandGuards";

export const WINDOW_DESCRIPTIONS: Record<LimitWindow, string> = {
  "10m": "every 10 minutes",
  "1h": "every hour",
  "6h": "every 6 hours",
  "24h": "every 24 hours",
  "7d": "every 7 days",
};

const LIMIT_WINDOW_PATTERN = /^(\d+)(m|h|d)$/;

export interface ResolvedGuildContext {
  guildId: string;
}

export async function requireGuildContext(
  ctx: GuildCommandContext,
  permissions: string | readonly string[] | string[] = ["ManageRoles"],
): Promise<ResolvedGuildContext | null> {
  if (!ctx.guildId) {
    await ctx.write({ content: GUILD_ONLY_MESSAGE });
    return null;
  }
  const guildId = ctx.guildId;

  const allowed = await requireGuildPermission(ctx, {
    guildId,
    permissions,
  });

  if (!allowed) {
    return null;
  }

  const enabled = await isFeatureEnabled(guildId, Features.Roles);
  if (!enabled) {
    await ctx.write({
      content:
        "The managed roles system is disabled in this server.",
      flags: 64,
    });
    return null;
  }

  await GuildStore.ensure(guildId);
  return { guildId };
}

/* ------------------------------------------------------------------ */
/* Roles snapshots from repo.readRoles()                               */
/* ------------------------------------------------------------------ */

import {
  listGuildRoleSnapshots,
  type RoleSnapshot,
} from "@/modules/guild-roles";

export type ManagedRoleSnapshot = RoleSnapshot;

export async function fetchManagedRoles(
  guildId: string,
): Promise<ManagedRoleSnapshot[]> {
  return listGuildRoleSnapshots(guildId);
}

export async function findManagedRole(
  guildId: string,
  key: string,
): Promise<ManagedRoleSnapshot | null> {
  const roles = await fetchManagedRoles(guildId);
  return roles.find((role) => role.key === key) ?? null;
}

/* ------------------------------------------------------------------ */
/* Parsing/formatting helpers                             */
/* ------------------------------------------------------------------ */

export interface ResolvedAction {
  definition: ModerationActionDefinition;
  key: string;
}

export function resolveActionInput(
  raw: string | undefined,
): { action: ResolvedAction } | { error: string } {
  if (!raw) return { error: "You must specify a moderation action." };

  const normalised = raw.trim().toLowerCase();
  if (!normalised) return { error: "You must specify a moderation action." };

  if (normalised.includes(".")) {
    return {
      error:
        "Invalid action format. Use simple names like `kick`, `ban`, `warn`, `timeout`, or `purge`.",
    };
  }

  const action =
    DEFAULT_MODERATION_ACTIONS.find(
      (entry) =>
        entry.key === normalised || entry.label.toLowerCase() === normalised,
    ) ?? null;

  if (!action) {
    const available = DEFAULT_MODERATION_ACTIONS.map(
      (entry) => `\`${entry.key}\``,
    ).join(", ");
    return { error: `Unknown action. Available options: ${available}.` };
  }

  return { action: { definition: action, key: action.key } };
}

export interface ParsedLimitWindow {
  window: LimitWindow;
  seconds: number;
}

export function parseLimitWindowInput(
  input: string | undefined,
): ParsedLimitWindow | null {
  if (!input) return null;
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  const match = raw.match(LIMIT_WINDOW_PATTERN);
  if (!match) return null;

  const value = Number.parseInt(match[1], 10);
  if (!Number.isFinite(value) || value <= 0) return null;

  const unit = match[2];
  const multiplier = unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
  const seconds = value * multiplier;

  return { window: raw as LimitWindow, seconds };
}

export function limitWindowToSeconds(window: LimitWindow): number {
  const match = window.match(LIMIT_WINDOW_PATTERN);
  if (!match) {
    console.warn(`[roles] Invalid window: ${window}. Returning 0 seconds.`);
    return 0;
  }

  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  const multiplier = unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
  return value * multiplier;
}

export function buildLimitRecord(
  limit: number,
  window: LimitWindow,
): RoleLimitRecord {
  return {
    limit: Math.max(0, Math.floor(limit)),
    window,
    windowSeconds: limitWindowToSeconds(window),
  };
}

export function formatOverrideValue(
  override: RoleCommandOverride | undefined,
): string {
  switch (override) {
    case "allow":
      return "Allow";
    case "deny":
      return "Deny";
    default:
      return "Inherit";
  }
}

export function formatLimitRecord(limit: RoleLimitRecord | undefined): string {
  if (!limit || !Number.isFinite(limit.limit) || limit.limit <= 0) {
    return "No limit configured";
  }

  const count = Math.max(0, Math.floor(limit.limit));
  const description =
    (limit.window ? WINDOW_DESCRIPTIONS[limit.window] : null) ??
    (limit.windowSeconds ? `every ${limit.windowSeconds}s` : "without fixed window");

  return `${count} use(s) - ${description}`;
}

export function buildModerationSummary(snapshot: ManagedRoleSnapshot): string {
  return DEFAULT_MODERATION_ACTIONS.map((action) => {
    const override = snapshot.overrides[action.key] ?? "inherit";
    const limit = snapshot.limits[action.key];
    return `- **${action.label}** -> ${formatOverrideValue(override)} - ${formatLimitRecord(
      limit,
    )}`;
  }).join("\n");
}
