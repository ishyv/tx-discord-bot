import { Schema, model, type InferSchemaType } from "mongoose";
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

const GuildSchema = new Schema(
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

export type GuildDoc = InferSchemaType<typeof GuildSchema> & {
  id: string;
  roles: GuildRolesRecord;
  channels: GuildChannelsRecord;
  features: GuildFeaturesRecord;
};

export const GuildModel = model<GuildDoc>("Guild", GuildSchema);
