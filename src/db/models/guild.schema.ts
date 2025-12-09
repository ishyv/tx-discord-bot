/**
 * Motivación: definir el modelo guild en Mongoose para mantener el esquema de la colección en un único lugar.
 *
 * Idea/concepto: declara tipos y restricciones en el schema para mapear documentos de Mongo a la aplicación.
 *
 * Alcance: representa la forma de los datos; no implementa reglas de negocio ni flujos de aplicación.
 */
import {
  Schema,
  model,
  type InferSchemaType,
  type HydratedDocument,
} from "mongoose";
import type { ChannelId, GuildId } from "@/db/types";
import type { CoreChannelName } from "@/modules/guild-channels/constants";

/** Identifier for a capability we expose to managed roles. */
export type RoleCapabilityKey = string;

export type RoleCommandOverride = "inherit" | "allow" | "deny";
export type RoleCommandOverrideMap = Record<
  RoleCapabilityKey,
  RoleCommandOverride
>;

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
  channelId: ChannelId;
}

/** Persisted shape for staff-configured optional channels. */
export interface ManagedChannelRecord {
  id: string;
  label: string;
  channelId: ChannelId;
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

export const DEFAULT_GUILD_FEATURES: Readonly<Record<Features, boolean>> =
  Object.freeze(
    Object.fromEntries(
      Object.values(Features).map((feature) => [feature, true]),
    ) as Record<Features, boolean>,
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

/** Sub-schema para la configuración de reputación. */
const GuildReputationSchema = new Schema(
  {
    keywords: { type: [String], default: [] },
  },
  { _id: false },
);

type GuildReputation = InferSchemaType<typeof GuildReputationSchema>;

export const GuildSchema = new Schema(
  {
    _id: { type: String, required: true }, // GuildId

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
      type: GuildReputationSchema,
      default: () => ({ keywords: [] }),
    },
  },
  {
    collection: "guilds",
    versionKey: false,
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
    id: false,
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  },
);

// ===== Types derived from schema =====

type GuildSchemaType = InferSchemaType<typeof GuildSchema>;

export type GuildData = Omit<
  GuildSchemaType,
  " _id" | "roles" | "channels" | "features" | "reputation" | "createdAt" | "updatedAt"
> & {
  _id: GuildId;
  roles: GuildRolesRecord;
  channels: GuildChannelsRecord;
  features: GuildFeaturesRecord;
  reputation: GuildReputation;
  createdAt: Date;
  updatedAt: Date;
};

// Documento hidratado de Mongoose
export type GuildDoc = HydratedDocument<GuildData>;

// ===== Model =====

export const GuildModel = model<GuildData>("Guild", GuildSchema);
