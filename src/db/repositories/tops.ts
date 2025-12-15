/**
 * TOPs repository using native Mongo driver and Zod validation.
 * Purpose: manage TOP windows and reports with validated data and simple helpers.
 */
import { getDb } from "@/db/mongo";
import {
  TopWindowSchema,
  TopReportSchema,
  type TopWindow,
  type TopReport,
  TOP_DEFAULTS,
} from "@/db/schemas/tops";
import { deepClone } from "@/db/helpers";
import type { ChannelId, GuildId } from "@/db/types";

const windowsCol = async () => (await getDb()).collection<TopWindow>("top_windows");
const reportsCol = async () => (await getDb()).collection<TopReport>("top_reports");

const parseWindow = (doc: unknown): TopWindow => TopWindowSchema.parse(doc);
const parseReport = (doc: unknown): TopReport => TopReportSchema.parse(doc);

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

/**
 * Asegura que exista una ventana de TOPs para el guild indicado.
 */
export async function ensureTopWindow(guildId: GuildId): Promise<TopWindow> {
  const col = await windowsCol();
  const now = new Date();
  const res = await col.findOneAndUpdate(
    { _id: guildId },
    {
      $setOnInsert: defaultWindow(guildId, now),
    },
    { returnDocument: "after", upsert: true },
  );
  const doc = res ?? (await col.findOne<TopWindow>({ _id: guildId }));
  if (!doc) throw new Error(`No se pudo inicializar la ventana de TOPs para ${guildId}`);
  return parseWindow(doc);
}

/**
 * Obtiene la ventana de TOPs actual para el guild.
 */
export async function getTopWindow(guildId: GuildId): Promise<TopWindow> {
  const window = await ensureTopWindow(guildId);
  return deepClone(window);
}

/**
 * Actualiza configuración (canal, intervalo, tamaño de TOP) sin tocar contadores.
 */
export async function updateTopConfig(
  guildId: GuildId,
  patch: Partial<Pick<TopWindow, "channelId" | "intervalMs" | "topSize">>,
): Promise<TopWindow> {
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

  const col = await windowsCol();
  const doc = await col.findOneAndUpdate(
    { _id: guildId },
    {
      $set: set,
      $setOnInsert: defaultWindow(guildId),
    },
    { returnDocument: "after", upsert: true },
  );
  const mapped = doc ?? (await col.findOne<TopWindow>({ _id: guildId }));
  if (!mapped) {
    throw new Error(`No se pudo actualizar la configuración de TOPs para ${guildId}`);
  }
  return parseWindow(mapped);
}

/**
 * Reinicia los contadores y abre una nueva ventana iniciando en `startedAt`.
 */
export async function resetTopWindow(
  guildId: GuildId,
  startedAt: Date = new Date(),
): Promise<TopWindow> {
  const col = await windowsCol();
  const doc = await col.findOneAndUpdate(
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
      $setOnInsert: defaultWindow(guildId, startedAt),
    },
    { returnDocument: "after", upsert: true },
  );
  const value = doc ?? (await col.findOne<TopWindow>({ _id: guildId }));
  if (!value) throw new Error(`No se pudo reiniciar la ventana de TOPs para ${guildId}`);
  return parseWindow(value);
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

  return docs.map(parseWindow);
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
  const created = parseReport({
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
  });
  const result = await col.insertOne(created);
  const persisted = { ...created, _id: result.insertedId ?? created._id };
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
  const value = doc ?? (await col.findOne<TopWindow>({ _id: guildId }));
  return value ? parseWindow(value) : null;
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
  return docs.map(parseReport);
}

export type { TopWindow, TopReport };
