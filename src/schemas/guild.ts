/**
 * Motivación: definir el contrato de datos guild para asegurar que el resto del código consuma estructuras consistentes.
 *
 * Idea/concepto: usa tipos/interfaces para describir campos esperados y su intención en el dominio.
 *
 * Alcance: solo declara formas de datos; no valida en tiempo de ejecución ni persiste información.
 */
import type { CoreChannelName } from "@/modules/guild-channels/constants";

/** Identifier for a capability we expose to managed roles. */
export type RoleCapabilityKey = string;

export type RoleCommandOverride = "inherit" | "allow" | "deny";
export type RoleCommandOverrideMap = Record<RoleCapabilityKey, RoleCommandOverride>;

export type LimitWindow = `${number}${"m" | "h" | "d"}`;

export interface RoleLimitRecord {
  limit: number;
  window: LimitWindow | null;
  windowSeconds?: number | null;
}

export type RoleLimitMap = Partial<Record<RoleCapabilityKey, RoleLimitRecord>>;

/** Persisted configuration for a guild role. */
export interface GuildRoleRecord {
  /** Stable human label shown in the dashboard. */
  label: string;
  /** Discord role this configuration operates on. */
  discordRoleId: string | null;
  /** Custom limitations applied over Discord permissions. */
  limits: RoleLimitMap;
  /** Overrides for allowing/denying moderation actions handled by the bot. */
  reach: RoleCommandOverrideMap;
  /** Last moderator updating the configuration. */
  updatedBy: string | null;
  /** Timestamp in ISO format representing the last update. */
  updatedAt: string | null;
}

export type GuildRolesRecord = Record<string, GuildRoleRecord>;

/** Persisted shape for a required channel entry. */
export interface CoreChannelRecord {
  name: CoreChannelName;
  label: string;
  channelId: string;
}

/** Persisted shape for staff-configured optional channels. */
export interface ManagedChannelRecord {
  id: string;
  label: string;
  channelId: string;
}

export interface GuildChannelsRecord {
  core: Record<CoreChannelName, CoreChannelRecord | null>;
  managed: Record<string, ManagedChannelRecord>;
  ticketMessageId?: string | null;
  ticketHelperRoles: string[];
}

export type GuildFeatureFlag =
  | "tickets"
  | "automod"
  | "autoroles"
  | "warns"
  | "roles"
  | "reputation"
  | "reputationDetection";

export type GuildFeaturesRecord = Partial<Record<GuildFeatureFlag, boolean>>;

export const DEFAULT_GUILD_FEATURES: Readonly<Record<GuildFeatureFlag, boolean>> =
  Object.freeze({
    tickets: true,
    automod: true,
    autoroles: true,
    warns: true,
    roles: true,
    reputation: true,
    reputationDetection: true,
  });

export interface Guild {
  id: string;
  roles: GuildRolesRecord;
  channels: GuildChannelsRecord;
  pendingTickets: string[];
  features: GuildFeaturesRecord;
  reputation: {
    keywords: string[];
  };
  createdAt?: Date;
  updatedAt?: Date;
}
