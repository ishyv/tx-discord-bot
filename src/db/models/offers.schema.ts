/**
 * Motivación: definir el modelo offers en Mongoose para mantener el esquema de la colección en un único lugar.
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
import type {
  ChannelId,
  GuildId,
  MessageId,
  OfferId,
  UserId,
} from "@/db/types";

/** Estados que recorre una oferta durante su ciclo de vida. */
export const offerStatus = {
  enumValues: [
    "PENDING_REVIEW",
    "APPROVED",
    "REJECTED",
    "CHANGES_REQUESTED",
    "WITHDRAWN",
  ] as const,
};

export type OfferStatus = (typeof offerStatus.enumValues)[number];

/* ==============================
 * OfferDetails
 * ============================ */

/** Datos que el autor provee para construir el embed de la oferta. */
const OfferDetailsSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    requirements: { type: String, default: null },
    workMode: { type: String, default: null },
    duration: { type: String, default: null },
    salary: { type: String, default: null },
    contact: { type: String, default: null },
    labels: { type: [String], default: [] },
    location: { type: String, default: null },
  },
  { _id: false },
);

export type OfferDetails = {
  title: string;
  description: string;
  requirements: string | null;
  workMode: string | null;
  duration: string | null;
  salary: string | null;
  contact: string | null;
  labels: string[];
  location: string | null;
};

/* ==============================
 * Offer
 * ============================ */

const OfferSchema = new Schema(
  {
    _id: { type: String, required: true }, // OfferId
    guildId: { type: String, required: true }, // GuildId
    authorId: { type: String, required: true }, // UserId

    status: {
      type: String,
      required: true,
      enum: offerStatus.enumValues,
    },

    details: { type: OfferDetailsSchema, required: true },

    embed: { type: Schema.Types.Mixed, required: true },

    reviewMessageId: { type: String, default: null }, // MessageId
    reviewChannelId: { type: String, default: null }, // ChannelId

    publishedMessageId: { type: String, default: null }, // MessageId
    publishedChannelId: { type: String, default: null }, // ChannelId

    rejectionReason: { type: String, default: null },
    changesNote: { type: String, default: null },
    lastModeratorId: { type: String, default: null }, // UserId
  },
  {
    collection: "offers",
    versionKey: false,
    timestamps: true,
    id: false,
  },
);

OfferSchema.index({ status: 1, guildId: 1 });
OfferSchema.index(
  { guildId: 1, authorId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["PENDING_REVIEW", "CHANGES_REQUESTED"] },
    },
  },
);

// Tipo base inferido desde el schema
type OfferSchemaType = InferSchemaType<typeof OfferSchema>;

// Capa de dominio: aplicamos tipos branded y nullables específicos
export type OfferData = Omit<
  OfferSchemaType,
  | "_id"
  | "guildId"
  | "authorId"
  | "details"
  | "reviewMessageId"
  | "reviewChannelId"
  | "publishedMessageId"
  | "publishedChannelId"
  | "lastModeratorId"
  | "rejectionReason"
  | "changesNote"
> & {
  _id: OfferId;
  id: OfferId;
  guildId: GuildId;
  authorId: UserId;

  reviewMessageId: MessageId | null;
  reviewChannelId: ChannelId | null;
  publishedMessageId: MessageId | null;
  publishedChannelId: ChannelId | null;
  lastModeratorId: UserId | null;
  rejectionReason: string | null;
  changesNote: string | null;

  // por si el infer no lo captura muy explícito
  status: OfferStatus;
  details: OfferDetails;
  embed: any;
};

export type OfferDoc = HydratedDocument<OfferData>;

export const OfferModel = model<OfferData>("Offer", OfferSchema);
