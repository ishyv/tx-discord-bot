/**
 * Repositorio de ofertas.
 *
 * Responsabilidad:
 * - CRUD sobre la colección `offers` (MongoDB).
 * - Validación de entradas/salidas con Zod (`OfferSchema`).
 *
 * @remarks
 * Este repositorio retorna `Result<T>` para que el caller pueda distinguir entre
 * “no existe” (`Ok(null)`) y un error real de DB/validación (`Err(error)`).
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

const ACTIVE_OFFER_STATUSES: OfferStatus[] = [
  "PENDING_REVIEW",
  "CHANGES_REQUESTED",
];

const ACTIVE_OFFER_INDEX_KEY = { guildId: 1, authorId: 1 } as const;
const ACTIVE_OFFER_INDEX_NAME = "uniq_active_offer_per_author";

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
  const col = (await getDb()).collection<Offer>("offers");

  try {
    // Índices son un detalle de infraestructura: no deben tumbar el bot en runtime.
    // Si algo falla acá, preferimos degradar (log) y permitir que el resto del sistema
    // siga funcionando (aunque se pierda la garantía de unicidad hasta que se arregle).
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
    // No propagar códigos del driver (ej. 11000) para que no se confunda con errores de dominio.
    const message = error instanceof Error ? error.message : String(error);
    console.error("[offers] Failed to ensure indexes:", error);

    // Si hay duplicados activos, ayudamos al operador listando algunos casos.
    try {
      const duplicates = await col
        .aggregate([
          { $match: { status: { $in: ACTIVE_OFFER_STATUSES } } },
          {
            $group: {
              _id: { guildId: "$guildId", authorId: "$authorId" },
              count: { $sum: 1 },
              offerIds: { $push: "$_id" },
            },
          },
          { $match: { count: { $gt: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ])
        .toArray();

      if (duplicates.length) {
        console.error(
          "[offers] Duplicate active offers found (showing up to 10 groups):",
          duplicates,
        );
      }
    } catch (scanError) {
      console.error("[offers] Failed to scan duplicate active offers:", scanError);
    }

    console.error(`OFFERS_INDEX_SETUP_FAILED: ${message}`);
    return;
  }
}

const offersCollection = async () => {
  if (!offersIndexesEnsured) {
    // Lazy init: se asegura al primer acceso a la colección para evitar trabajo extra
    // en arranque si el módulo de ofertas no se usa.
    offersIndexesEnsured = ensureOffersIndexes();
  }

  await offersIndexesEnsured;
  return (await getDb()).collection<Offer>("offers");
};

// Traduce errores del driver a errores de dominio (ej: clave duplicada).
const mapError = (error: unknown): Error => {
  if ((error as any)?.code === 11000) return new Error("ACTIVE_OFFER_EXISTS");
  return error instanceof Error ? error : new Error(String(error));
};

// Wrapper pequeño para ejecutar una operación de DB y devolverla como `Result<T>`.
const withDb = async <T>(op: () => Promise<T>): Promise<Result<T>> => {
  try {
    return OkResult(await op());
  } catch (error) {
    return ErrResult(mapError(error));
  }
};

// Todo documento que sale del repo se valida por Zod.
const parseOffer = (doc: unknown): Offer => {
  const parsed = OfferSchema.safeParse(doc);
  if (parsed.success) return parsed.data;
  console.error("[offers] invalid offer document; using safe fallback", parsed.error);

  // Este fallback es deliberadamente conservador:
  // - Evita que un documento corrupto/legacy provoque un crash en runtime.
  // - Mantiene un shape mínimo para que los callers puedan mostrar/editar/retirar sin
  //   reventar al acceder propiedades.
  // - NO intenta "arreglar" ni persistir el documento: solo permite degradar.

  const fallbackId =
    typeof (doc as any)?._id === "string"
      ? ((doc as any)._id as OfferId)
      : typeof (doc as any)?.id === "string"
        ? ((doc as any).id as OfferId)
        : ("unknown" as OfferId);
  const guildId =
    typeof (doc as any)?.guildId === "string"
      ? ((doc as any).guildId as GuildId)
      : ("unknown" as GuildId);
  const authorId =
    typeof (doc as any)?.authorId === "string"
      ? ((doc as any).authorId as UserId)
      : ("unknown" as UserId);

  const now = new Date();
  return {
    _id: fallbackId,
    guildId,
    authorId,
    status: "PENDING_REVIEW" as OfferStatus,
    details: ((doc as any)?.details ?? {}) as OfferDetails,
    embed: (doc as any)?.embed ?? null,
    reviewMessageId: (doc as any)?.reviewMessageId ?? null,
    reviewChannelId: (doc as any)?.reviewChannelId ?? null,
    createdAt: (doc as any)?.createdAt instanceof Date ? (doc as any).createdAt : now,
    updatedAt: (doc as any)?.updatedAt instanceof Date ? (doc as any).updatedAt : now,
  } as Offer;
};

/**
 * Datos necesarios para crear una oferta.
 *
 * @remarks
 * `id` es determinístico/externo (no usamos `ObjectId` como llave primaria).
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
 *
 * @remarks
 * Si existe un constraint/índice que impide ofertas activas duplicadas, el repo retorna
 * `Err(Error("ACTIVE_OFFER_EXISTS"))` para que el caller pueda mostrar un mensaje claro.
 */
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

/**
 * Busca una oferta por su id.
 *
 * @returns `Ok(Offer)` si existe, `Ok(null)` si no existe.
 */
export async function findById(id: OfferId): Promise<Result<Offer | null>> {
  return withDb(async () => {
    const col = await offersCollection();
    const doc = await col.findOne({ _id: id });
    return doc ? parseOffer(doc) : null;
  });
}

/**
 * Busca una oferta “activa” (pendiente o con cambios pedidos) para un autor en un guild.
 */
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
    const updated = await col.findOneAndUpdate(
      query,
      { $set: { ...patch, updatedAt: now } },
      { returnDocument: "after" },
    );
    return updated ? parseOffer(updated) : null;
  });
}

/**
 * Lista ofertas por estado dentro del guild.
 *
 * @param statuses Se valida cada valor con `OfferStatusSchema` para evitar queries inválidas.
 */
export async function listByStatus(
  guildId: GuildId,
  statuses: OfferStatus[],
): Promise<Result<Offer[]>> {
  return withDb(async () => {
    const col = await offersCollection();
    const safeStatuses = statuses
      .map((s) => OfferStatusSchema.safeParse(s))
      .filter((r) => r.success)
      .map((r) => (r as any).data as OfferStatus);
    if (!safeStatuses.length) return [];
    // Importante: consultamos con `safeStatuses` para evitar queries inválidas y para que
    // el comportamiento coincida con la intención (validar inputs antes de tocar la DB).
    const docs = await col.find({ guildId, status: { $in: safeStatuses } }).toArray();
    return docs.map(parseOffer);
  });
}

/**
 * Elimina una oferta por id.
 *
 * @returns `Ok(true)` si se borró, `Ok(false)` si no existía.
 */
export async function removeOffer(id: OfferId): Promise<Result<boolean>> {
  return withDb(async () => {
    const col = await offersCollection();
    const res = await col.deleteOne({ _id: id });
    return (res.deletedCount ?? 0) > 0;
  });
}
