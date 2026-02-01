/**
 * Repositorio de TOPs (ventanas y reportes).
 */
import { ObjectId } from "mongodb";
import { MongoStore } from "@/db/mongo-store";
import {
  TopWindowSchema,
  TopReportSchema,
  type TopWindow,
  type TopReport,
  TOP_DEFAULTS,
} from "@/db/schemas/tops";
import { deepClone } from "@/db/helpers";
import type { ChannelId, GuildId } from "@/db/types";
import { normalizeSnowflake } from "@/utils/snowflake";

/**
 * Store for active Top Windows.
 * Key: GuildId
 */
export const TopWindowStore = new MongoStore<TopWindow>(
  "top_windows",
  TopWindowSchema,
);

/**
 * Store for historical Top Reports.
 * Key: Auto-generated string ID
 */
export const TopReportStore = new MongoStore<TopReport>(
  "top_reports",
  TopReportSchema,
);

const buildTopReportId = (): string => new ObjectId().toHexString();

function validateGuildId(guildId: string | undefined | null): string {
  if (!guildId || typeof guildId !== "string") {
    throw new Error("guildId is required and must be a string");
  }
  return guildId;
}

/**
 * Asegura que exista una ventana de TOPs para el guild indicado.
 */
export async function ensureTopWindow(guildId: GuildId): Promise<TopWindow> {
  validateGuildId(guildId);
  const now = new Date();
  const res = await TopWindowStore.ensure(guildId, {
    guildId,
    channelId: null,
    intervalMs: TOP_DEFAULTS.intervalMs,
    topSize: TOP_DEFAULTS.topSize,
    windowStartedAt: now,
    lastReportAt: null,
    emojiCounts: {},
    channelCounts: {},
    reputationDeltas: {},
  });
  return res.unwrap();
}

/**
 * Obtiene la ventana de TOPs actual para el guild.
 */
export async function getTopWindow(guildId: GuildId): Promise<TopWindow> {
  validateGuildId(guildId);
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
  validateGuildId(guildId);
  const safeInterval =
    typeof patch.intervalMs === "number" && Number.isFinite(patch.intervalMs)
      ? Math.max(1, Math.trunc(patch.intervalMs))
      : undefined;

  const safeSize =
    typeof patch.topSize === "number" && Number.isFinite(patch.topSize)
      ? Math.max(1, Math.trunc(patch.topSize))
      : undefined;

  const updates: Record<string, any> = {};
  if (patch.channelId !== undefined) {
    updates.channelId = normalizeSnowflake(patch.channelId);
  }
  if (safeInterval !== undefined) {
    updates.intervalMs = safeInterval;
  }
  if (safeSize !== undefined) {
    updates.topSize = safeSize;
  }

  if (Object.keys(updates).length === 0) {
    return getTopWindow(guildId);
  }

  const res = await TopWindowStore.patch(guildId, updates);
  if (res.isErr()) {
    return getTopWindow(guildId);
  }
  return res.unwrap();
}

/**
 * Reinicia los contadores y abre una nueva ventana iniciando en `startedAt`.
 */
export async function resetTopWindow(
  guildId: GuildId,
  startedAt: Date = new Date(),
): Promise<TopWindow> {
  validateGuildId(guildId);
  const res = await TopWindowStore.patch(guildId, {
    windowStartedAt: startedAt,
    lastReportAt: null,
    emojiCounts: {},
    channelCounts: {},
    reputationDeltas: {},
  } as any);

  if (res.isErr()) {
    return ensureTopWindow(guildId);
  }
  return res.unwrap();
}

/**
 * Incrementa contadores de emojis usados en la ventana activa.
 */
export async function bumpEmojiCounts(
  guildId: GuildId,
  increments: Record<string, number>,
): Promise<void> {
  validateGuildId(guildId);
  const inc: Record<string, number> = {};
  for (const [key, delta] of Object.entries(increments)) {
    if (!Number.isFinite(delta)) continue;
    const amount = Math.trunc(delta);
    if (amount === 0) continue;
    inc[`emojiCounts.${key}`] = amount;
  }
  if (!Object.keys(inc).length) return;

  await ensureTopWindow(guildId);
  const col = await TopWindowStore.collection();
  await col.updateOne(
    { _id: guildId },
    { $inc: inc as any, $set: { updatedAt: new Date() } as any },
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
  validateGuildId(guildId);
  if (!Number.isFinite(delta) || !channelId) return;
  const amount = Math.trunc(delta);
  if (amount === 0) return;

  await ensureTopWindow(guildId);
  const col = await TopWindowStore.collection();
  await col.updateOne(
    { _id: guildId },
    {
      $inc: { [`channelCounts.${channelId}`]: amount } as any,
      $set: { updatedAt: new Date() } as any,
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
  validateGuildId(guildId);
  if (!Number.isFinite(delta) || delta === 0 || !userId) return;
  const amount = Math.trunc(delta);
  if (amount === 0) return;

  await ensureTopWindow(guildId);
  const col = await TopWindowStore.collection();
  await col.updateOne(
    { _id: guildId },
    {
      $inc: { [`reputationDeltas.${userId}`]: amount } as any,
      $set: { updatedAt: new Date() } as any,
    },
  );
}

/**
 * Devuelve las ventanas listas para emitir un reporte (intervalo cumplido).
 */
export async function findDueWindows(
  now: Date = new Date(),
): Promise<TopWindow[]> {
  const res = await TopWindowStore.find({
    channelId: { $ne: null },
    intervalMs: { $gt: 0 },
    windowStartedAt: { $exists: true },
    $expr: { $lte: [{ $add: ["$windowStartedAt", "$intervalMs"] }, now] },
  });
  return res.isOk() ? res.unwrap() : [];
}

/**
 * Guarda un snapshot histórico con los datos actuales del ciclo.
 */
export async function persistTopReport(payload: {
  guildId: string;
  periodStart: Date;
  periodEnd: Date;
  intervalMs: number;
  emojiCounts: Record<string, number>;
  channelCounts: Record<string, number>;
  reputationDeltas: Record<string, number>;
  metadata?: Record<string, unknown> | null;
}): Promise<TopReport> {
  const reportId = buildTopReportId();
  const res = await TopReportStore.set(reportId, {
    _id: reportId,
    guildId: payload.guildId,
    periodStart: payload.periodStart,
    periodEnd: payload.periodEnd,
    intervalMs: payload.intervalMs,
    emojiCounts: payload.emojiCounts ?? {},
    channelCounts: payload.channelCounts ?? {},
    reputationDeltas: payload.reputationDeltas ?? {},
    metadata: payload.metadata ?? null,
  });
  return res.unwrap();
}

/**
 * Reinicia la ventana tras emitir un reporte.
 */
export async function rotateWindowAfterReport(
  guildId: string,
  now: Date = new Date(),
): Promise<TopWindow | null> {
  const res = await TopWindowStore.patch(guildId, {
    windowStartedAt: now,
    lastReportAt: now,
    emojiCounts: {},
    channelCounts: {},
    reputationDeltas: {},
  } as any);

  return res.isOk() ? res.unwrap() : null;
}

/**
 * Lista historial reciente de reportes para el guild.
 */
export async function listReports(
  guildId: string,
  limit = 10,
): Promise<TopReport[]> {
  const res = await TopReportStore.find(
    { guildId },
    {
      limit,
      sort: { createdAt: -1 } as any,
    },
  );

  return res.isOk() ? res.unwrap() : [];
}

export type { TopWindow, TopReport };
