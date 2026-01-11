/**
 * Repositorio de TOPs (ventanas y reportes).
 *
 * Modelo:
 * - `top_windows`: 1 documento por guild con contadores acumulados durante una “ventana”.
 * - `top_reports`: snapshots históricos generados al reportar/rotar una ventana.
 *
 * Responsabilidad:
 * - Validar lecturas/escrituras con Zod.
 * - Mantener defaults y shapes estables para los consumers.
 */
import { ObjectId } from "mongodb";
import { getDb } from "@/db/mongo";
import {
  TopWindowSchema,
  TopReportSchema,
  type TopWindow,
  type TopReport,
  TOP_DEFAULTS,
} from "@/db/schemas/tops";
import {
  buildSafeUpsertUpdate,
  deepClone,
  unwrapFindOneAndUpdateResult,
} from "@/db/helpers";
import type { ChannelId, GuildId } from "@/db/types";

const windowsCol = async () => (await getDb()).collection<TopWindow>("top_windows");
const reportsCol = async () => (await getDb()).collection<TopReport>("top_reports");

// We always store string _id values in MongoDB for consistency with the rest of the codebase.
// Mongo would generate ObjectId by default, which breaks our TopReport schema and types.
const buildTopReportId = (): string => new ObjectId().toHexString();

const normalizeReportDoc = (doc: unknown): unknown => {
  if (!doc || typeof doc !== "object") return doc;
  const current = doc as { _id?: unknown };
  if (current._id === undefined || typeof current._id === "string") return doc;
  // Legacy compatibility: older reports stored ObjectId. We coerce to string for read-only
  // parsing; migrate the collection to store strings long-term.
  // See tmp/db-migrations/top-reports-string-id.js.
  return { ...(doc as Record<string, unknown>), _id: String(current._id) };
};

// Valida cada lectura/escritura con Zod para mantener defaults y tipos.
//
// Nota importante (política de runtime): este repo evita `throw`.
// Mongo puede contener documentos legacy/corruptos y Zod `.parse()` puede lanzar.
// Por eso se usa `safeParse` + fallbacks, y se loguea el problema en vez de tumbar el bot.

/**
 * Construye un documento fallback "válido" para `TopWindow`.
 *
 * @remarks
 * Este fallback no se persiste automáticamente: su propósito es permitir que el resto
 * del bot continúe operando si un documento en DB está corrupto.
 */
const buildFallbackWindowDoc = (doc: any, now: Date = new Date()) => {
  const guildId =
    (typeof doc?.guildId === "string" && doc.guildId) ||
    (typeof doc?._id === "string" && doc._id) ||
    "unknown";

  return {
    _id: guildId,
    guildId,
    channelId: null,
    intervalMs: TOP_DEFAULTS.intervalMs,
    topSize: TOP_DEFAULTS.topSize,
    windowStartedAt: now,
    lastReportAt: null,
    emojiCounts: {},
    channelCounts: {},
    reputationDeltas: {},
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * Construye un documento fallback "válido" para `TopReport`.
 *
 * @remarks
 * Los reportes son históricos: si uno está corrupto, preferimos degradar el listado
 * antes que romper comandos/handlers que muestran historial.
 */
const buildFallbackReportDoc = (doc: any, now: Date = new Date()) => {
  const guildId =
    (typeof doc?.guildId === "string" && doc.guildId) ||
    (typeof doc?._id === "string" && doc._id) ||
    "unknown";

  const fallbackId =
    typeof doc?._id === "string"
      ? doc._id
      : doc?._id != null
        ? String(doc._id)
        : buildTopReportId();

  return {
    _id: fallbackId,
    guildId,
    periodStart: doc?.periodStart instanceof Date ? doc.periodStart : new Date(0),
    periodEnd: doc?.periodEnd instanceof Date ? doc.periodEnd : new Date(0),
    intervalMs:
      typeof doc?.intervalMs === "number" && Number.isFinite(doc.intervalMs)
        ? Math.max(1, Math.trunc(doc.intervalMs))
        : TOP_DEFAULTS.intervalMs,
    emojiCounts: {},
    channelCounts: {},
    reputationDeltas: {},
    metadata: null,
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * Normaliza un documento de ventana.
 *
 * @remarks
 * - Si el doc es válido, retorna el tipado de Zod.
 * - Si es inválido, loguea y retorna defaults.
 */
const parseWindow = (doc: unknown): TopWindow => {
  const parsed = TopWindowSchema.safeParse(doc);
  if (parsed.success) return parsed.data;
  console.error("TOPs: failed to parse TopWindow; using fallback", parsed.error);
  const fallback = buildFallbackWindowDoc(doc);
  const fallbackParsed = TopWindowSchema.safeParse(fallback);
  return fallbackParsed.success ? fallbackParsed.data : (fallback as unknown as TopWindow);
};

/**
 * Normaliza un documento de reporte.
 *
 * @remarks
 * Igual que `parseWindow`, se diseñó para no tirar exceptions en runtime.
 */
const parseReport = (doc: unknown): TopReport => {
  const normalized = normalizeReportDoc(doc);
  const parsed = TopReportSchema.safeParse(normalized);
  if (parsed.success) return parsed.data;
  console.error("TOPs: failed to parse TopReport; using fallback", parsed.error);
  const fallback = buildFallbackReportDoc(normalized);
  const fallbackParsed = TopReportSchema.safeParse(fallback);
  return fallbackParsed.success ? fallbackParsed.data : (fallback as unknown as TopReport);
};

const defaultWindow = (guildId: GuildId, now = new Date()): TopWindow =>
  parseWindow({
    _id: guildId,
    guildId,
    channelId: null,
    intervalMs: TOP_DEFAULTS.intervalMs,
    topSize: TOP_DEFAULTS.topSize,
    windowStartedAt: now,
    lastReportAt: null,
    emojiCounts: {},
    channelCounts: {},
    reputationDeltas: {},
    createdAt: now,
    updatedAt: now,
  });

const buildWindowInsertDefaults = (
  guildId: GuildId,
  now: Date = new Date(),
): Record<string, unknown> => ({
  _id: guildId,
  guildId,
  channelId: null,
  intervalMs: TOP_DEFAULTS.intervalMs,
  topSize: TOP_DEFAULTS.topSize,
  windowStartedAt: now,
  lastReportAt: null,
  createdAt: now,
});

/**
 * Asegura que exista una ventana de TOPs para el guild indicado.
 *
 * @remarks
 * Usa `upsert` + `$setOnInsert` para inicializar una ventana con `_id = guildId`.
 */
export async function ensureTopWindow(guildId: GuildId): Promise<TopWindow> {
  const col = await windowsCol();
  const now = new Date();
  const insertDefaults = buildWindowInsertDefaults(guildId, now);
  const update = buildSafeUpsertUpdate<TopWindow>(
    { $setOnInsert: insertDefaults },
    insertDefaults,
    now,
    { setUpdatedAt: false },
  );
  const res = await col.findOneAndUpdate(
    { _id: guildId },
    update,
    { returnDocument: "after", upsert: true },
  );
  const doc =
    unwrapFindOneAndUpdateResult<TopWindow>(res) ??
    (await col.findOne<TopWindow>({ _id: guildId }));
  if (!doc) {
    console.error(`No se pudo inicializar la ventana de TOPs para ${guildId}`);
    return defaultWindow(guildId, now);
  }
  try {
    return parseWindow(doc);
  } catch (error) {
    console.error("TOPs: failed to parse window; using defaults", { guildId, error });
    return defaultWindow(guildId, now);
  }
}

/**
 * Obtiene la ventana de TOPs actual para el guild.
 *
 * @returns Una copia (`deepClone`) para que el caller no mutile el objeto persistido.
 */
export async function getTopWindow(guildId: GuildId): Promise<TopWindow> {
  const window = await ensureTopWindow(guildId);
  return deepClone(window);
}

/**
 * Actualiza configuración (canal, intervalo, tamaño de TOP) sin tocar contadores.
 *
 * @remarks
 * - `intervalMs` y `topSize` se normalizan a enteros positivos.
 * - `channelId` vacío se convierte a `null` (deshabilita reportes).
 */
export async function updateTopConfig(
  guildId: GuildId,
  patch: Partial<Pick<TopWindow, "channelId" | "intervalMs" | "topSize">>,
): Promise<TopWindow> {
  const now = new Date();
  const safeInterval =
    typeof patch.intervalMs === "number" && Number.isFinite(patch.intervalMs)
      ? Math.max(1, Math.trunc(patch.intervalMs))
      : undefined;

  const safeSize =
    typeof patch.topSize === "number" && Number.isFinite(patch.topSize)
      ? Math.max(1, Math.trunc(patch.topSize))
      : undefined;

  const set: Record<string, unknown> = {
    guildId,
    updatedAt: now,
  };
  if (patch.channelId !== undefined) {
    set.channelId =
      typeof patch.channelId === "string" && patch.channelId.length > 0
        ? patch.channelId
        : null;
  }
  if (safeInterval !== undefined) {
    set.intervalMs = safeInterval;
  }
  if (safeSize !== undefined) {
    set.topSize = safeSize;
  }
  if (Object.keys(set).length === 0) {
    return getTopWindow(guildId);
  }

  const col = await windowsCol();
  const insertDefaults = buildWindowInsertDefaults(guildId, now);
  const update = buildSafeUpsertUpdate<TopWindow>(
    {
      $set: set,
      $setOnInsert: insertDefaults,
    },
    insertDefaults,
    now,
  );
  const doc = await col.findOneAndUpdate(
    { _id: guildId },
    update,
    { returnDocument: "after", upsert: true },
  );
  const mapped =
    unwrapFindOneAndUpdateResult<TopWindow>(doc) ??
    (await col.findOne<TopWindow>({ _id: guildId }));
  if (!mapped) {
    console.error(`No se pudo actualizar la configuración de TOPs para ${guildId}`);
    return getTopWindow(guildId);
  }
  try {
    return parseWindow(mapped);
  } catch (error) {
    console.error("TOPs: failed to parse updated window; returning current", {
      guildId,
      error,
    });
    return getTopWindow(guildId);
  }
}

/**
 * Reinicia los contadores y abre una nueva ventana iniciando en `startedAt`.
 */
export async function resetTopWindow(
  guildId: GuildId,
  startedAt: Date = new Date(),
): Promise<TopWindow> {
  const col = await windowsCol();
  const now = new Date();
  const insertDefaults = buildWindowInsertDefaults(guildId, startedAt);
  const update = buildSafeUpsertUpdate<TopWindow>(
    {
      $set: {
        windowStartedAt: startedAt,
        lastReportAt: null,
        emojiCounts: {},
        channelCounts: {},
        reputationDeltas: {},
        updatedAt: now,
      },
      $setOnInsert: insertDefaults,
    },
    insertDefaults,
    now,
  );
  const doc = await col.findOneAndUpdate(
    { _id: guildId },
    update,
    { returnDocument: "after", upsert: true },
  );
  const value =
    unwrapFindOneAndUpdateResult<TopWindow>(doc) ??
    (await col.findOne<TopWindow>({ _id: guildId }));
  if (!value) {
    console.error(`No se pudo reiniciar la ventana de TOPs para ${guildId}`);
    return defaultWindow(guildId, startedAt);
  }
  try {
    return parseWindow(value);
  } catch (error) {
    console.error("TOPs: failed to parse reset window; using defaults", {
      guildId,
      error,
    });
    return defaultWindow(guildId, startedAt);
  }
}

/**
 * Incrementa contadores de emojis usados en la ventana activa.
 */
export async function bumpEmojiCounts(
  guildId: GuildId,
  increments: Record<string, number>,
): Promise<void> {
  const inc: Record<string, number> = {};
  for (const [key, delta] of Object.entries(increments)) {
    if (!Number.isFinite(delta)) continue;
    const amount = Math.trunc(delta);
    if (amount === 0) continue;
    inc[`emojiCounts.${key}`] = amount;
  }
  if (!Object.keys(inc).length) return;

  await ensureTopWindow(guildId);
  const col = await windowsCol();
  await col.updateOne(
    { _id: guildId },
    { $inc: inc, $set: { updatedAt: new Date() } },
  );
}

/**
 * Incrementa el contador de mensajes por canal.
 */
export async function bumpChannelCount(
  guildId: GuildId,
  channelId: ChannelId,
  delta = 1,
): Promise<void> {
  if (!Number.isFinite(delta) || !channelId) return;
  const amount = Math.trunc(delta);
  if (amount === 0) return;

  await ensureTopWindow(guildId);
  const col = await windowsCol();
  await col.updateOne(
    { _id: guildId },
    {
      $inc: { [`channelCounts.${channelId}`]: amount },
      $set: { updatedAt: new Date() },
    },
  );
}

/**
 * Ajusta la reputación neta del usuario dentro de la ventana activa.
 */
export async function bumpReputationDelta(
  guildId: GuildId,
  userId: string,
  delta: number,
): Promise<void> {
  if (!Number.isFinite(delta) || delta === 0 || !userId) return;
  const amount = Math.trunc(delta);
  if (amount === 0) return;

  await ensureTopWindow(guildId);
  const col = await windowsCol();
  await col.updateOne(
    { _id: guildId },
    {
      $inc: { [`reputationDeltas.${userId}`]: amount },
      $set: { updatedAt: new Date() },
    },
  );
}

/**
 * Devuelve las ventanas listas para emitir un reporte (intervalo cumplido).
 */
export async function findDueWindows(
  now: Date = new Date(),
): Promise<TopWindow[]> {
  const col = await windowsCol();
  const docs = await col
    .find({
      channelId: { $ne: null },
      intervalMs: { $gt: 0 },
      windowStartedAt: { $exists: true },
      $expr: { $lte: [{ $add: ["$windowStartedAt", "$intervalMs"] }, now] },
    })
    .toArray();

  // Importante: filtramos docs inválidos.
  // Razón: una sola ventana corrupta no debería romper el loop de reporte.
  const parsed = docs
    .map((doc) => TopWindowSchema.safeParse(doc))
    .filter((res) => {
      if (res.success) return true;
      console.error("TOPs: invalid top window document", res.error);
      return false;
    })
    .map((res) => (res as any).data as TopWindow);

  return parsed;
}

/**
 * Guarda un snapshot histórico con los datos actuales del ciclo.
 */
export async function persistTopReport(
  payload: {
    guildId: string;
    periodStart: Date;
    periodEnd: Date;
    intervalMs: number;
    emojiCounts: Record<string, number>;
    channelCounts: Record<string, number>;
    reputationDeltas: Record<string, number>;
    metadata?: Record<string, unknown> | null;
  },
): Promise<TopReport> {
  const col = await reportsCol();
  // IMPORTANT: force a string _id to keep ids consistent across the codebase.
  // If omitted, MongoDB would generate an ObjectId and break schema validation on read.
  const reportId = buildTopReportId();
  const createdRaw = {
    _id: reportId,
    guildId: payload.guildId,
    periodStart: payload.periodStart,
    periodEnd: payload.periodEnd,
    intervalMs: payload.intervalMs,
    emojiCounts: payload.emojiCounts ?? {},
    channelCounts: payload.channelCounts ?? {},
    reputationDeltas: payload.reputationDeltas ?? {},
    metadata: payload.metadata ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const createdParsed = TopReportSchema.safeParse(createdRaw);
  if (!createdParsed.success) {
    console.error("TOPs: invalid report payload; using best-effort fallback", {
      guildId: payload.guildId,
      error: createdParsed.error,
    });
  }

  const created = createdParsed.success
    ? createdParsed.data
    : (createdRaw as unknown as TopReport);

  const result = await col.insertOne(created);
  const persisted = { ...created, _id: result.insertedId ?? (created as any)._id };
  return parseReport(persisted);
}

/**
 * Reinicia la ventana tras emitir un reporte.
 */
export async function rotateWindowAfterReport(
  guildId: string,
  now: Date = new Date(),
): Promise<TopWindow | null> {
  const col = await windowsCol();
  const doc = await col.findOneAndUpdate(
    { _id: guildId },
    {
      $set: {
        windowStartedAt: now,
        lastReportAt: now,
        emojiCounts: {},
        channelCounts: {},
        reputationDeltas: {},
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
  const value =
    unwrapFindOneAndUpdateResult<TopWindow>(doc) ??
    (await col.findOne<TopWindow>({ _id: guildId }));
  if (!value) return null;
  const parsed = TopWindowSchema.safeParse(value);
  if (!parsed.success) {
    console.error("TOPs: invalid top window document after rotation", {
      guildId,
      error: parsed.error,
    });
    return null;
  }
  return parsed.data;
}

/**
 * Lista historial reciente de reportes para el guild.
 */
export async function listReports(
  guildId: string,
  limit = 10,
): Promise<TopReport[]> {
  const col = await reportsCol();
  const docs = await col
    .find({ guildId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  // Igual que en ventanas: si hay un reporte histórico corrupto, lo omitimos.
  const parsed = docs
    .map((doc) => TopReportSchema.safeParse(normalizeReportDoc(doc)))
    .filter((res) => {
      if (res.success) return true;
      console.error("TOPs: invalid top report document", res.error);
      return false;
    })
    .map((res) => (res as any).data as TopReport);

  return parsed;
}

export type { TopWindow, TopReport };
