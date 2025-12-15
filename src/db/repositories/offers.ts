/**
 * Offer repository using native Mongo driver and Zod validation.
 * Purpose: CRUD for offers with validated inputs/outputs and normalized defaults.
 */
import { getDb } from "@/db/mongo";
import {
  OfferSchema,
  OfferStatusSchema,
  type Offer,
  type OfferDetails,
  type OfferStatus,
} from "@/db/schemas/offers";
import type { GuildId, OfferId, UserId } from "@/db/types";
import { type Result, OkResult, ErrResult } from "@/utils/result";

const offersCollection = async () => (await getDb()).collection<Offer>("offers");

const mapError = (error: unknown): Error => {
  if ((error as any)?.code === 11000) return new Error("ACTIVE_OFFER_EXISTS");
  return error instanceof Error ? error : new Error(String(error));
};

const withDb = async <T>(op: () => Promise<T>): Promise<Result<T>> => {
  try {
    return OkResult(await op());
  } catch (error) {
    return ErrResult(mapError(error));
  }
};

const parseOffer = (doc: unknown): Offer => OfferSchema.parse(doc);

export interface CreateOfferInput {
  id: OfferId;
  guildId: GuildId;
  authorId: UserId;
  details: OfferDetails;
  embed: any;
  reviewMessageId: string | null;
  reviewChannelId: string | null;
}

/** Crea una nueva oferta en la base de datos. */
export async function createOffer(input: CreateOfferInput): Promise<Result<Offer>> {
  return withDb(async () => {
    const now = new Date();
    const doc = parseOffer({
      _id: input.id,
      guildId: input.guildId,
      authorId: input.authorId,
      status: "PENDING_REVIEW",
      details: input.details,
      embed: input.embed,
      reviewMessageId: input.reviewMessageId,
      reviewChannelId: input.reviewChannelId,
      createdAt: now,
      updatedAt: now,
    });
    const col = await offersCollection();
    await col.insertOne(doc);
    return doc;
  });
}

/** Busca una oferta por su ID. */
export async function findById(id: OfferId): Promise<Result<Offer | null>> {
  return withDb(async () => {
    const col = await offersCollection();
    const doc = await col.findOne({ _id: id });
    return doc ? parseOffer(doc) : null;
  });
}

/** Busca una oferta activa (pendiente o con cambios pedidos) para un autor en un servidor. */
export async function findActiveByAuthor(
  guildId: GuildId,
  authorId: UserId,
): Promise<Result<Offer | null>> {
  return withDb(async () => {
    const col = await offersCollection();
    const doc = await col.findOne({
      guildId,
      authorId,
      status: { $in: ["PENDING_REVIEW", "CHANGES_REQUESTED"] as OfferStatus[] },
    });
    return doc ? parseOffer(doc) : null;
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
    const col = await offersCollection();
    const query: Record<string, unknown> = { _id: id };
    if (options.allowedFrom && options.allowedFrom.length) {
      query.status = { $in: options.allowedFrom };
    }
    const now = new Date();
    const doc = await col.findOneAndUpdate(
      query,
      { $set: { ...patch, updatedAt: now } },
      { returnDocument: "after" },
    );
    const value = doc ?? (await col.findOne({ _id: id }));
    return value ? parseOffer(value) : null;
  });
}

/** Lista ofertas por estado. */
export async function listByStatus(
  guildId: GuildId,
  statuses: OfferStatus[],
): Promise<Result<Offer[]>> {
  return withDb(async () => {
    const col = await offersCollection();
    statuses.forEach((s) => OfferStatusSchema.parse(s));
    const docs = await col.find({ guildId, status: { $in: statuses } }).toArray();
    return docs.map(parseOffer);
  });
}

/** Elimina una oferta por id. */
export async function removeOffer(id: OfferId): Promise<Result<boolean>> {
  return withDb(async () => {
    const col = await offersCollection();
    const res = await col.deleteOne({ _id: id });
    return (res.deletedCount ?? 0) > 0;
  });
}
