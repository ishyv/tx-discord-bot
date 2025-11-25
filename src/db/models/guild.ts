/**
 * Motivación: definir el modelo guild en Mongoose para mantener el esquema de la colección en un único lugar.
 *
 * Idea/concepto: declara tipos y restricciones en el schema para mapear documentos de Mongo a la aplicación.
 *
 * Alcance: representa la forma de los datos; no implementa reglas de negocio ni flujos de aplicación.
 */
import { Schema, model } from "mongoose";
import type {
  GuildChannelsRecord,
  GuildRolesRecord,
  GuildFeaturesRecord,
} from "@/schemas/guild";
import { DEFAULT_GUILD_FEATURES } from "@/schemas/guild";

const EMPTY_ROLES: GuildRolesRecord = {};
const EMPTY_CHANNELS: GuildChannelsRecord = {
  core: {} as GuildChannelsRecord["core"],
  managed: {},
  ticketMessageId: null,
  ticketHelperRoles: [],
} as any as GuildChannelsRecord;

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

// Sanity index for quick lookups by guildId (also the _id).
GuildSchema.index({ _id: 1 });

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

export const GuildModel = model<GuildDoc>("Guild", GuildSchema);
