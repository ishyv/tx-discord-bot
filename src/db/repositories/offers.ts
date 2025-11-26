/**
 * Motivación: concentrar operaciones de acceso a datos de offers en una API reutilizable.
 *
 * Idea/concepto: envuelve modelos y consultas en funciones claras para que el resto del código no conozca detalles de persistencia.
 *
 * Alcance: provee CRUD y helpers de datos; no define reglas de negocio ni validaciones complejas.
 */
import { connectMongo } from "../client";
import { OfferModel, type OfferDoc } from "../models/offers";
import type { Offer, OfferDetails, OfferStatus } from "@/schemas/offers";

const ACTIVE_STATUSES: OfferStatus[] = ["PENDING_REVIEW", "CHANGES_REQUESTED"];

const mapOffer = (doc: OfferDoc | null): Offer | null => {
  if (!doc) return null;
  return {
    id: doc._id,
    guildId: doc.guildId,
    authorId: doc.authorId,
    status: doc.status as OfferStatus,
    details: doc.details as OfferDetails,
    embed: doc.embed,
    reviewMessageId: doc.reviewMessageId ?? null,
    reviewChannelId: doc.reviewChannelId ?? null,
    publishedMessageId: doc.publishedMessageId ?? null,
    publishedChannelId: doc.publishedChannelId ?? null,
    rejectionReason: doc.rejectionReason ?? null,
    changesNote: doc.changesNote ?? null,
    lastModeratorId: doc.lastModeratorId ?? null,
    createdAt: doc.createdAt ?? undefined,
    updatedAt: doc.updatedAt ?? undefined,
  };
};

export interface CreateOfferInput {
  id: string;
  guildId: string;
  authorId: string;
  details: OfferDetails;
  embed: any;
  reviewMessageId: string | null;
  reviewChannelId: string | null;
}

export async function createOffer(input: CreateOfferInput): Promise<Offer> {
  await connectMongo();
  try {
    const doc = await new OfferModel({
      _id: input.id,
      guildId: input.guildId,
      authorId: input.authorId,
      status: "PENDING_REVIEW",
      details: input.details,
      embed: input.embed,
      reviewMessageId: input.reviewMessageId,
      reviewChannelId: input.reviewChannelId,
    }).save();
    return mapOffer(doc)!;
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new Error("ACTIVE_OFFER_EXISTS");
    }
    throw error;
  }
}

export async function findById(id: string): Promise<Offer | null> {
  await connectMongo();
  const doc = await OfferModel.findById(id).lean<OfferDoc>();
  return mapOffer(doc ?? null);
}

export async function findActiveByAuthor(
  guildId: string,
  authorId: string,
): Promise<Offer | null> {
  await connectMongo();
  const doc = await OfferModel.findOne({
    guildId,
    authorId,
    status: { $in: ACTIVE_STATUSES },
  }).lean<OfferDoc>();
  return mapOffer(doc ?? null);
}

export async function updateOffer(
  id: string,
  patch: Partial<Offer>,
): Promise<Offer | null> {
  await connectMongo();
  const doc = await OfferModel.findOneAndUpdate(
    { _id: id },
    { $set: { ...patch, updatedAt: new Date() } },
    { new: true, lean: true },
  ).lean<OfferDoc>();
  return mapOffer(doc ?? null);
}

export async function transitionOffer(
  id: string,
  nextStatus: OfferStatus,
  allowedFrom: OfferStatus[],
  patch: Partial<Offer> = {},
): Promise<Offer | null> {
  await connectMongo();
  const doc = await OfferModel.findOneAndUpdate(
    { _id: id, status: { $in: allowedFrom } },
    {
      $set: {
        status: nextStatus,
        ...patch,
        updatedAt: new Date(),
      },
    },
    { new: true, lean: true },
  ).lean<OfferDoc>();
  return mapOffer(doc ?? null);
}

export async function listByStatus(
  guildId: string,
  statuses: OfferStatus[],
): Promise<Offer[]> {
  await connectMongo();
  const docs = await OfferModel.find({ guildId, status: { $in: statuses } }).lean<OfferDoc[]>();
  return docs.map((doc: OfferDoc) => mapOffer(doc)!).filter(Boolean);
}
