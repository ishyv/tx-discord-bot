/**
 * Motivación: concentrar operaciones de acceso a datos de offers en una API reutilizable y robusta.
 *
 * Idea/concepto: envuelve modelos y consultas en funciones que retornan Result<T, E> para manejo explícito de errores.
 *
 * Alcance: provee CRUD y helpers de datos; captura errores de base de datos y los normaliza.
 */
import { connectMongo } from "../client";
import { OfferModel, type OfferDoc } from "../models/offers";
import type { Offer, OfferDetails, OfferStatus } from "@/schemas/offers";
import { type Result, OkResult, ErrResult } from "@/utils/result";

const ACTIVE_STATUSES: OfferStatus[] = ["PENDING_REVIEW", "CHANGES_REQUESTED"];

/** Mapea un documento de Mongoose a la interfaz Offer. */
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

/**
 * Crea una nueva oferta en la base de datos.
 * Retorna Err si ya existe una oferta activa (duplicate key) o si falla la conexión.
 */
export async function createOffer(input: CreateOfferInput): Promise<Result<Offer>> {
  try {
    await connectMongo();
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

    const offer = mapOffer(doc);
    if (!offer) return ErrResult(new Error("Failed to map created offer"));

    return OkResult(offer);
  } catch (error: any) {
    if (error?.code === 11000) {
      return ErrResult(new Error("ACTIVE_OFFER_EXISTS"));
    }
    return ErrResult(error instanceof Error ? error : new Error(String(error)));
  }
}

/** Busca una oferta por su ID. */
export async function findById(id: string): Promise<Result<Offer | null>> {
  try {
    await connectMongo();
    const doc = await OfferModel.findById(id).lean<OfferDoc>();
    return OkResult(mapOffer(doc ?? null));
  } catch (error) {
    return ErrResult(error instanceof Error ? error : new Error(String(error)));
  }
}

/** Busca una oferta activa (pendiente o con cambios pedidos) para un autor en un servidor. */
export async function findActiveByAuthor(
  guildId: string,
  authorId: string,
): Promise<Result<Offer | null>> {
  try {
    await connectMongo();
    const doc = await OfferModel.findOne({
      guildId,
      authorId,
      status: { $in: ACTIVE_STATUSES },
    }).lean<OfferDoc>();
    return OkResult(mapOffer(doc ?? null));
  } catch (error) {
    return ErrResult(error instanceof Error ? error : new Error(String(error)));
  }
}

/** Actualiza una oferta existente. */
export async function updateOffer(
  id: string,
  patch: Partial<Offer>,
): Promise<Result<Offer | null>> {
  try {
    await connectMongo();
    const doc = await OfferModel.findOneAndUpdate(
      { _id: id },
      { $set: { ...patch, updatedAt: new Date() } },
      { new: true, lean: true },
    ).lean<OfferDoc>();
    return OkResult(mapOffer(doc ?? null));
  } catch (error) {
    return ErrResult(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Realiza una transición de estado segura.
 * Solo actualiza si el estado actual está en `allowedFrom`.
 */
export async function transitionOffer(
  id: string,
  nextStatus: OfferStatus,
  allowedFrom: OfferStatus[],
  patch: Partial<Offer> = {},
): Promise<Result<Offer | null>> {
  try {
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
    return OkResult(mapOffer(doc ?? null));
  } catch (error) {
    return ErrResult(error instanceof Error ? error : new Error(String(error)));
  }
}

/** Lista ofertas por estado. */
export async function listByStatus(
  guildId: string,
  statuses: OfferStatus[],
): Promise<Result<Offer[]>> {
  try {
    await connectMongo();
    const docs = await OfferModel.find({ guildId, status: { $in: statuses } }).lean<OfferDoc[]>();
    const offers = docs.map((doc: OfferDoc) => mapOffer(doc)!).filter(Boolean);
    return OkResult(offers);
  } catch (error) {
    return ErrResult(error instanceof Error ? error : new Error(String(error)));
  }
}
