/**
 * Motivación: definir el modelo guild en Mongoose para mantener el esquema de la colección en un único lugar.
 *
 * Idea/concepto: declara tipos y restricciones en el schema para mapear documentos de Mongo a la aplicación.
 *
 * Alcance: representa la forma de los datos; no implementa reglas de negocio ni flujos de aplicación.
 */
import { Schema, model } from "mongoose";
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
  managed: Record<string, ManagedChannelRecord>; // key=channel alias
  ticketMessageId?: string | null;
  ticketHelperRoles: string[];
}

/**
 * Enumeración de features configurables del servidor.
 * Cada feature puede ser habilitada o deshabilitada a través del dashboard.
 */
export enum Features {
  Tickets = "tickets",
  Automod = "automod",
  Autoroles = "autoroles",
  Warns = "warns",
  Roles = "roles",
  Reputation = "reputation",
  ReputationDetection = "reputationDetection",
  Tops = "tops",
  Suggest = "suggest",
  Economy = "economy", // Balance, transacciones, tienda, etc.
  Game = "game", // Inventario, uso de objectos, trabajos entre otras funcionalidades de juego
  
}

export type GuildFeaturesRecord = Partial<Record<Features, boolean>>;

export const DEFAULT_GUILD_FEATURES: Readonly<Record<Features, boolean>> = Object.freeze(
  Object.fromEntries(
    Object.values(Features).map((feature) => [feature, true])
  ) as Record<Features, boolean>
);


const EMPTY_ROLES: GuildRolesRecord = {};
const EMPTY_CHANNELS: GuildChannelsRecord = {
  core: {
    welcome: null,
    goodbye: null,
    logs: null,
    reports: null,
    suggestions: null,
    tickets: null,
  },
  managed: {},
  ticketMessageId: null,
  ticketHelperRoles: [],
};

export const GuildSchema = new Schema(
  {
    _id: { type: String, required: true }, // Discord guildId
    roles: {
      type: Schema.Types.Mixed,
      default: () => ({ ...EMPTY_ROLES }),
    },
    channels: {
      type: Schema.Types.Mixed,
      default: () => ({ ...EMPTY_CHANNELS }),
    },
    pendingTickets: {
      type: [String],
      default: [],
    },
    features: {
      type: Schema.Types.Mixed,
      default: () => ({ ...DEFAULT_GUILD_FEATURES }),
    },
    reputation: {
      type: new Schema(
        {
          keywords: { type: [String], default: [] },
        },
        { _id: false },
      ),
      default: () => ({ keywords: [] }),
    },
  },
  {
    collection: "guilds",
    versionKey: false,
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  },
);

GuildSchema.virtual("id").get(function virtualId(this: { _id: string }) {
  return this._id;
});

export interface GuildDoc {
  _id: string;
  id: string;
  roles: GuildRolesRecord;
  channels: GuildChannelsRecord;
  features: GuildFeaturesRecord;
  reputation: { keywords: string[] };
  pendingTickets: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GuildData {
  id: string;
  roles: GuildRolesRecord;
  channels: GuildChannelsRecord;
  pendingTickets: string[];
  features: GuildFeaturesRecord;
  reputation: { keywords: string[] };
  createdAt: Date;
  updatedAt: Date;
}

export const GuildModel = model<GuildDoc>("Guild", GuildSchema);
