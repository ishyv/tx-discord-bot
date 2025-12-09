/**
 * Motivación: concentrar operaciones de acceso a datos del sistema de TOPs en una API reutilizable.
 *
 * Idea/concepto: funciones pequeñas que manipulan la ventana activa, los contadores y el historial
 * de reportes sin exponer detalles de Mongoose al resto del código.
 *
 * Alcance: CRUD de configuraciones/ventanas y snapshots históricos; no genera embeds ni envía mensajes.
 */
import { connectMongo } from "@/db/client";
import { TOP_DEFAULTS, TopReportModel, TopWindowModel } from "@/db/models/tops.schema";
import { deepClone } from "@/db/helpers";
import type { TopReportRecord, TopWindowRecord } from "@/db/models/tops.schema";
import type { ChannelId, GuildId } from "@/db/types";

const EMPTY_COUNTS: Record<string, number> = {};

const asDate = (value: unknown, fallback: Date | null): Date | null => {
  if (!value) return fallback;
  if (value instanceof Date) return value;
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const normalizeNumberMap = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== "object") return {};
  const entries =
    value instanceof Map
      ? Array.from(value.entries())
      : Object.entries(value as Record<string, unknown>);

  const acc: Record<string, number> = {};
  for (const [key, raw] of entries) {
    const num = Number(raw);
    if (Number.isFinite(num)) {
      acc[key] = num;
    }
  }
  return acc;
};

const toWindow = (doc: unknown): TopWindowRecord | null => {
  if (!doc) return null;
  const base = doc as unknown as Record<string, unknown>;
  return {
    guildId: (base.guildId as string) ?? (base._id as string),
    channelId:
      typeof base.channelId === "string" && base.channelId.length > 0
        ? (base.channelId as string)
        : null,
    intervalMs: Number(base.intervalMs ?? TOP_DEFAULTS.intervalMs),
    topSize: Number(base.topSize ?? TOP_DEFAULTS.topSize),
    windowStartedAt: asDate(base.windowStartedAt, new Date()) as Date,
    lastReportAt: asDate(base.lastReportAt, null),
    emojiCounts: normalizeNumberMap(base.emojiCounts),
    channelCounts: normalizeNumberMap(base.channelCounts),
    reputationDeltas: normalizeNumberMap(base.reputationDeltas),
    createdAt: asDate(base.createdAt, null) ?? undefined,
    updatedAt: asDate(base.updatedAt, null) ?? undefined,
  } as unknown as TopWindowRecord;
};

const toReport = (doc: unknown): TopReportRecord | null => {
  if (!doc) return null;
  const base = doc as unknown as Record<string, unknown>;
  return {
    id: base._id ? String(base._id) : String(base.id ?? ""),
    guildId: base.guildId ? String(base.guildId) : "",
    periodStart: asDate(base.periodStart, new Date()) as Date,
    periodEnd: asDate(base.periodEnd, new Date()) as Date,
    intervalMs: Number(base.intervalMs ?? 0),
    emojiCounts: normalizeNumberMap(base.emojiCounts),
    channelCounts: normalizeNumberMap(base.channelCounts),
    reputationDeltas: normalizeNumberMap(base.reputationDeltas),
    metadata: (base.metadata as Record<string, unknown> | null) ?? null,
    createdAt: asDate(base.createdAt, null) ?? undefined,
    updatedAt: asDate(base.updatedAt, null) ?? undefined,
  } as unknown as TopReportRecord;
};

/**
 * Asegura que exista una ventana de TOPs para el guild indicado.
 */
export async function ensureTopWindow(guildId: GuildId): Promise<TopWindowRecord> {
  await connectMongo();
  const now = new Date();
  const doc = await TopWindowModel.findOneAndUpdate(
    { _id: guildId },
    {
      $setOnInsert: {
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
      },
    },
    { new: true, upsert: true, lean: true },
  );
  const mapped = toWindow(doc);
  if (!mapped) {
    throw new Error(`No se pudo inicializar la ventana de TOPs para ${guildId}`);
  }
  return mapped;
}

/**
 * Obtiene la ventana de TOPs actual para el guild.
 */
export async function getTopWindow(guildId: GuildId): Promise<TopWindowRecord> {
  const window = await ensureTopWindow(guildId);
  return deepClone(window);
}

/**
 * Actualiza configuración (canal, intervalo, tamaño de TOP) sin tocar contadores.
 */
export async function updateTopConfig(
  guildId: GuildId,
  patch: Partial<Pick<TopWindowRecord, "channelId" | "intervalMs" | "topSize">>,
): Promise<TopWindowRecord> {
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
    updatedAt: new Date(),
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

  await connectMongo();
  const doc = await TopWindowModel.findOneAndUpdate(
    { _id: guildId },
    {
      $set: set,
      $setOnInsert: {
        windowStartedAt: new Date(),
        lastReportAt: null,
        emojiCounts: {},
        channelCounts: {},
        reputationDeltas: {},
      },
    },
    { new: true, upsert: true, lean: true },
  );
  const mapped = toWindow(doc);
  if (!mapped) {
    throw new Error(`No se pudo actualizar la configuración de TOPs para ${guildId}`);
  }
  return mapped;
}

/**
 * Reinicia los contadores y abre una nueva ventana iniciando en `startedAt`.
 */
export async function resetTopWindow(
  guildId: GuildId,
  startedAt: Date = new Date(),
): Promise<TopWindowRecord> {
  await connectMongo();
  const doc = await TopWindowModel.findOneAndUpdate(
    { _id: guildId },
    {
      $set: {
        windowStartedAt: startedAt,
        lastReportAt: null,
        emojiCounts: {},
        channelCounts: {},
        reputationDeltas: {},
        updatedAt: new Date(),
      },
      $setOnInsert: {
        guildId,
        channelId: null,
        intervalMs: TOP_DEFAULTS.intervalMs,
        topSize: TOP_DEFAULTS.topSize,
      },
    },
    { new: true, upsert: true, lean: true },
  );
  const mapped = toWindow(doc);
  if (!mapped) {
    throw new Error(`No se pudo reiniciar la ventana de TOPs para ${guildId}`);
  }
  return mapped;
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
  await TopWindowModel.updateOne(
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
  await TopWindowModel.updateOne(
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
  await TopWindowModel.updateOne(
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
): Promise<TopWindowRecord[]> {
  await connectMongo();
  const docs = await TopWindowModel.find({
    channelId: { $ne: null },
    intervalMs: { $gt: 0 },
    windowStartedAt: { $exists: true },
    $expr: { $lte: [{ $add: ["$windowStartedAt", "$intervalMs"] }, now] },
  }).lean();

  return docs.map((doc) => toWindow(doc)).filter(Boolean) as TopWindowRecord[];
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
): Promise<TopReportRecord> {
  await connectMongo();
  const created = await TopReportModel.create({
    guildId: payload.guildId,
    periodStart: payload.periodStart,
    periodEnd: payload.periodEnd,
    intervalMs: payload.intervalMs,
    emojiCounts: payload.emojiCounts ?? EMPTY_COUNTS,
    channelCounts: payload.channelCounts ?? EMPTY_COUNTS,
    reputationDeltas: payload.reputationDeltas ?? EMPTY_COUNTS,
    metadata: payload.metadata ?? null,
  });
  const lean = created.toObject();
  const mapped = toReport(lean);
  if (!mapped) {
    throw new Error(`No se pudo guardar el reporte de TOPs para ${payload.guildId}`);
  }
  return mapped;
}

/**
 * Reinicia la ventana tras emitir un reporte.
 */
export async function rotateWindowAfterReport(
  guildId: string,
  now: Date = new Date(),
): Promise<TopWindowRecord | null> {
  await connectMongo();
  const doc = await TopWindowModel.findOneAndUpdate(
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
    { new: true, lean: true },
  );
  return toWindow(doc);
}

/**
 * Lista historial reciente de reportes para el guild.
 */
export async function listReports(
  guildId: string,
  limit = 10,
): Promise<TopReportRecord[]> {
  await connectMongo();
  const docs = await TopReportModel.find({ guildId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return docs.map((doc) => toReport(doc)).filter(Boolean) as TopReportRecord[];
}

export type { TopWindowRecord, TopReportRecord };
