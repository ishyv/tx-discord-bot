/**
 * Motivación: concentrar operaciones de acceso a datos de offers en una API reutilizable y robusta.
 *
 * Idea/concepto: envuelve modelos y consultas en funciones que retornan Result<T, E> para manejo explícito de errores.
 *
 * Alcance: provee CRUD y helpers de datos; captura errores de base de datos y los normaliza.
 */
import { connectMongo } from "@/db/client";
import { OfferModel, type OfferDoc } from "@/db/models/offers.schema";
import type { OfferData as Offer, OfferDetails, OfferStatus } from "@/db/models/offers.schema";
import type { GuildId, OfferId, UserId } from "@/db/types";
import { type Result, OkResult, ErrResult } from "@/utils/result";

const ACTIVE_STATUSES: OfferStatus[] = ["PENDING_REVIEW", "CHANGES_REQUESTED"];

/** Normaliza un documento (lean o toObject) a un POJO de dominio. */
const toOffer = (raw: any): Offer | null => {
  if (!raw) return null;
  const created = raw.createdAt ? new Date(raw.createdAt) : new Date();
  const updated = raw.updatedAt ? new Date(raw.updatedAt) : created;
  return {
    _id: String(raw._id),
    id: String(raw._id),
    guildId: raw.guildId,
    authorId: raw.authorId,
    status: raw.status as OfferStatus,
    details: raw.details as OfferDetails,
    embed: raw.embed,
    reviewMessageId: raw.reviewMessageId ?? null,
    reviewChannelId: raw.reviewChannelId ?? null,
    publishedMessageId: raw.publishedMessageId ?? null,
    publishedChannelId: raw.publishedChannelId ?? null,
    rejectionReason: raw.rejectionReason ?? null,
    changesNote: raw.changesNote ?? null,
    lastModeratorId: raw.lastModeratorId ?? null,
    createdAt: created,
    updatedAt: updated,
  };
};

const mapError = (error: unknown): Error => {
  if ((error as any)?.code === 11000) return new Error("ACTIVE_OFFER_EXISTS");
  return error instanceof Error ? error : new Error(String(error));
};

const withDb = async <T>(op: () => Promise<T>): Promise<Result<T>> => {
  try {
    await connectMongo();
    const data = await op();
    return OkResult(data);
  } catch (error) {
    return ErrResult(mapError(error));
  }
};

export interface CreateOfferInput {
  id: OfferId;
  guildId: GuildId;
  authorId: UserId;
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
  return withDb(async () => {
    const doc = await OfferModel.create({
      _id: input.id,
      guildId: input.guildId,
      authorId: input.authorId,
      status: "PENDING_REVIEW",
      details: input.details,
      embed: input.embed,
      reviewMessageId: input.reviewMessageId,
      reviewChannelId: input.reviewChannelId,
    });
    const offer = toOffer(doc.toObject() as OfferDoc);
    if (!offer) throw new Error("Failed to map created offer");
    return offer;
  });
}

/** Busca una oferta por su ID. */
export async function findById(id: OfferId): Promise<Result<Offer | null>> {
  return withDb(async () => {
    const doc = await OfferModel.findById(id).lean<OfferDoc>().exec();
    return toOffer(doc ?? null);
  });
}

/** Busca una oferta activa (pendiente o con cambios pedidos) para un autor en un servidor. */
export async function findActiveByAuthor(
  guildId: GuildId,
  authorId: UserId,
): Promise<Result<Offer | null>> {
  return withDb(async () => {
    const doc = await OfferModel.findOne({
      guildId,
      authorId,
      status: { $in: ACTIVE_STATUSES },
    })
      .lean<OfferDoc>()
      .exec();
    return toOffer(doc ?? null);
  });
}

export interface UpdateOfferOptions {
  /** Lista opcional de estados permitidos para aplicar el patch. */
  allowedFrom?: OfferStatus[];
}

/** Actualiza una oferta y retorna el documento resultante (o null si no coincide). */
export async function updateOffer(
  id: OfferId,
  patch: Partial<Offer>,
  options: UpdateOfferOptions = {},
): Promise<Result<Offer | null>> {
  return withDb(async () => {
    const query: Record<string, unknown> = { _id: id };
    if (options.allowedFrom && options.allowedFrom.length) {
      query.status = { $in: options.allowedFrom };
    }
    const doc = await OfferModel.findOneAndUpdate(
      query,
      { $set: { ...patch, updatedAt: new Date() } },
      { new: true, lean: true },
    )
      .lean<OfferDoc>()
      .exec();
    return toOffer(doc ?? null);
  });
}

/** Lista ofertas por estado. */
export async function listByStatus(
  guildId: GuildId,
  statuses: OfferStatus[],
): Promise<Result<Offer[]>> {
  return withDb(async () => {
    const docs = await OfferModel.find({ guildId, status: { $in: statuses } })
      .lean<OfferDoc[]>()
      .exec();
    return docs.map((doc) => toOffer(doc)).filter(Boolean) as Offer[];
  });
}

/** Elimina una oferta por id. */
export async function removeOffer(id: OfferId): Promise<Result<boolean>> {
  return withDb(async () => {
    const res = await OfferModel.deleteOne({ _id: id }).lean();
    return (res as any)?.deletedCount > 0;
  });
}
