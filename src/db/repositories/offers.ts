/**
 * Repositorio de ofertas.
 */
import { MongoStore } from "@/db/mongo-store";
import {
  OfferSchema,
  OfferStatusSchema,
  type Offer,
  type OfferDetails,
  type OfferStatus,
} from "@/db/schemas/offers";
import type { GuildId, OfferId, UserId } from "@/db/types";
import { type Result, OkResult, ErrResult } from "@/utils/result";

const ACTIVE_OFFER_STATUSES: OfferStatus[] = [
  "PENDING_REVIEW",
  "CHANGES_REQUESTED",
];

const ACTIVE_OFFER_INDEX_KEY = { guildId: 1, authorId: 1 } as const;
const ACTIVE_OFFER_INDEX_NAME = "uniq_active_offer_per_author";

/**
 * Store for Offers.
 * Key: OfferId (string)
 */
export const OfferStore = new MongoStore<Offer>("offers", OfferSchema);

let offersIndexesEnsured: Promise<void> | null = null;

function sameIndexKey(
  key: Record<string, unknown> | undefined,
  expected: Record<string, number>,
): boolean {
  if (!key) return false;
  const expectedKeys = Object.keys(expected);
  const actualKeys = Object.keys(key);
  if (expectedKeys.length !== actualKeys.length) return false;
  for (const k of expectedKeys) {
    if ((key as any)[k] !== expected[k]) return false;
  }
  return true;
}

function hasExactActiveStatusFilter(
  partial: Record<string, unknown> | undefined,
): boolean {
  const status = (partial as any)?.status;
  const candidates = status?.$in;
  if (!Array.isArray(candidates)) return false;
  if (candidates.length !== ACTIVE_OFFER_STATUSES.length) return false;
  return ACTIVE_OFFER_STATUSES.every((s) => candidates.includes(s));
}

async function ensureOffersIndexes(): Promise<void> {
  const col = await OfferStore.collection();

  try {
    const existing = await col.indexes();
    const alreadyOk = existing.some((idx) => {
      return (
        idx?.unique === true &&
        sameIndexKey(idx?.key as any, ACTIVE_OFFER_INDEX_KEY) &&
        hasExactActiveStatusFilter(idx?.partialFilterExpression as any)
      );
    });

    if (alreadyOk) return;

    const conflicting = existing.find((idx) =>
      sameIndexKey(idx?.key as any, ACTIVE_OFFER_INDEX_KEY),
    );
    if (conflicting) {
      console.error(
        `[offers] Índice conflictivo detectado: '${conflicting.name}'. ` +
        "Se requiere un índice UNIQUE con partialFilterExpression por estado para garantizar 1 oferta activa por autor. " +
        `Solución: eliminar el índice '${conflicting.name}' y reiniciar el bot para que se regenere.`,
      );
      return;
    }

    await col.createIndex(ACTIVE_OFFER_INDEX_KEY, {
      name: ACTIVE_OFFER_INDEX_NAME,
      unique: true,
      partialFilterExpression: {
        status: { $in: ACTIVE_OFFER_STATUSES },
      },
    });
  } catch (error) {
    console.error("[offers] Failed to ensure indexes:", error);
  }
}

async function offersCollection() {
  if (!offersIndexesEnsured) {
    offersIndexesEnsured = ensureOffersIndexes();
  }
  await offersIndexesEnsured;
  return OfferStore.collection();
}

/**
 * Traduce errores del driver a errores de dominio (ej: clave duplicada).
 */
const mapError = (error: unknown): Error => {
  const code = (error as any)?.code;
  const message = String((error as any)?.message ?? "");
  if (code === 11000) {
    // Prefer domain error for the unique index that prevents multiple active offers.
    if (message.includes(ACTIVE_OFFER_INDEX_NAME) || message.toLowerCase().includes("duplicate key")) {
      return new Error("ACTIVE_OFFER_EXISTS");
    }
    return new Error("ACTIVE_OFFER_EXISTS");
  }
  return error instanceof Error ? error : new Error(String(error));
};

/**
 * Datos necesarios para crear una oferta.
 */
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
 */
export async function createOffer(input: CreateOfferInput): Promise<Result<Offer>> {
  try {
    await offersCollection();
    const now = new Date();
    const res = await OfferStore.set(input.id, {
      _id: input.id,
      id: input.id,
      guildId: input.guildId,
      authorId: input.authorId,
      status: "PENDING_REVIEW",
      details: input.details,
      embed: input.embed,
      reviewMessageId: input.reviewMessageId,
      reviewChannelId: input.reviewChannelId,
      createdAt: now,
      updatedAt: now,
    } as any);
    if (res.isErr()) {
      return ErrResult(mapError(res.error));
    }
    return res;
  } catch (error) {
    return ErrResult(mapError(error));
  }
}

/**
 * Busca una oferta por su id.
 */
export async function findById(id: OfferId): Promise<Result<Offer | null>> {
  await offersCollection();
  return OfferStore.get(id);
}

/**
 * Busca una oferta “activa” (pendiente o con cambios pedidos) para un autor en un guild.
 */
export async function findActiveByAuthor(
  guildId: GuildId,
  authorId: UserId,
): Promise<Result<Offer | null>> {
  await offersCollection();
  const res = await OfferStore.find({
    guildId,
    authorId,
    status: { $in: ["PENDING_REVIEW", "CHANGES_REQUESTED"] as OfferStatus[] },
  });
  if (res.isErr()) return ErrResult(res.error);
  const docs = res.unwrap();
  return OkResult(docs.length > 0 ? docs[0] : null);
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
  try {
    await offersCollection();
    const query: Record<string, any> = { _id: id };
    if (options.allowedFrom && options.allowedFrom.length) {
      query.status = { $in: options.allowedFrom };
    }

    // We use raw findOneAndUpdate if we need a custom query with patch
    const col = await OfferStore.collection();
    const updated = await col.findOneAndUpdate(
      query,
      { $set: { ...patch, updatedAt: new Date() } as any },
      { returnDocument: "after" },
    );

    // Using MongoStore's internal safeDoc mapping would be nice but it's private.
    // However, OfferStore.get(id) will do the same after update.
    // For efficiency we can just parse it here if we had access, 
    // but findOneAndUpdate result needs to be parsed by OfferSchema.

    if (!updated) return OkResult(null);
    const parsed = OfferSchema.safeParse(updated);
    if (!parsed.success) return ErrResult(new Error(parsed.error.message));
    return OkResult(parsed.data);
  } catch (error) {
    return ErrResult(mapError(error));
  }
}

/**
 * Lista ofertas por estado dentro del guild.
 */
export async function listByStatus(
  guildId: GuildId,
  statuses: OfferStatus[],
): Promise<Result<Offer[]>> {
  await offersCollection();
  const safeStatuses = statuses
    .map((s) => OfferStatusSchema.safeParse(s))
    .filter((r) => r.success)
    .map((r) => (r as any).data as OfferStatus);

  if (!safeStatuses.length) return OkResult([]);

  return OfferStore.find({ guildId, status: { $in: safeStatuses } });
}

/**
 * Elimina una oferta por id.
 */
export async function removeOffer(id: OfferId): Promise<Result<boolean>> {
  await offersCollection();
  const res = await OfferStore.delete(id);
  if (res.isErr()) return ErrResult(res.error);
  return OkResult(res.unwrap());
}
