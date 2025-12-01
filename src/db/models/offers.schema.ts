/**
 * Motivación: definir el modelo offers en Mongoose para mantener el esquema de la colección en un único lugar.
 *
 * Idea/concepto: declara tipos y restricciones en el schema para mapear documentos de Mongo a la aplicación.
 *
 * Alcance: representa la forma de los datos; no implementa reglas de negocio ni flujos de aplicación.
 */
import { Schema, model, type InferSchemaType } from "mongoose";

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

/** Datos que el autor provee para construir el embed de la oferta. */
export interface OfferDetails {
  title: string;
  description: string;
  requirements?: string | null;
  workMode?: string | null;
  duration?: string | null;
  salary?: string | null;
  contact?: string | null;
  labels?: string[] | null;
  location?: string | null;
}

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

const OfferSchema = new Schema(
  {
    _id: { type: String, required: true },
    guildId: { type: String, required: true },
    authorId: { type: String, required: true },
    status: { type: String, required: true, enum: offerStatus.enumValues },
    details: { type: OfferDetailsSchema, required: true },
    embed: { type: Schema.Types.Mixed, required: true },
    reviewMessageId: { type: String, default: null },
    reviewChannelId: { type: String, default: null },
    publishedMessageId: { type: String, default: null },
    publishedChannelId: { type: String, default: null },
    rejectionReason: { type: String, default: null },
    changesNote: { type: String, default: null },
    lastModeratorId: { type: String, default: null },
  },
  {
    collection: "offers",
    versionKey: false,
    timestamps: true,
  },
);

OfferSchema.virtual("id").get(function virtualId(this: { _id: string }) {
  return this._id;
});

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

export type OfferDoc = InferSchemaType<typeof OfferSchema> & { id: string };

export type OfferData = {
  _id: string;
  id: string;
  guildId: string;
  authorId: string;
  status: OfferStatus;
  details: OfferDetails;
  embed: any;
  reviewMessageId: string | null;
  reviewChannelId: string | null;
  publishedMessageId: string | null;
  publishedChannelId: string | null;
  rejectionReason: string | null;
  changesNote: string | null;
  lastModeratorId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const OfferModel = model<OfferDoc>("Offer", OfferSchema);
