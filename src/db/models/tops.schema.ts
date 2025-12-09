/**
 * Motivación: definir los modelos de Mongo para el sistema de TOPs y mantener
 * un esquema único para configuraciones/ventanas activas y reportes históricos.
 *
 * Idea/concepto: persistir la ventana en curso (contadores e intervalo) y
 * almacenar snapshots inmutables cada vez que se envía un reporte.
 *
 * Alcance: describe la forma de los documentos y expone los modelos Mongoose;
 * no implementa la lógica de negocio del sistema de TOPs.
 */
import {
  Schema,
  model,
  type HydratedDocument,
} from "mongoose";
import type { ChannelId, GuildId, TopReportId } from "@/db/types";

const DEFAULT_TOP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const DEFAULT_TOP_SIZE = 10;

// Mongoose Map<number>, luego lo tipamos como Record<string, number> en TS
const mapOfNumbers = { type: Map, of: Number, default: {} } as const;

/* ==============================
 * TopWindow
 * ============================ */

const TopWindowSchema = new Schema(
  {
    _id: { type: String, required: true }, // GuildId
    guildId: { type: String, required: true },
    channelId: { type: String, default: null }, // ChannelId
    intervalMs: {
      type: Number,
      required: true,
      default: DEFAULT_TOP_INTERVAL_MS,
    },
    topSize: {
      type: Number,
      required: true,
      default: DEFAULT_TOP_SIZE,
    },
    windowStartedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    lastReportAt: { type: Date, default: null },
    emojiCounts: mapOfNumbers,
    channelCounts: mapOfNumbers,
    reputationDeltas: mapOfNumbers,
  },
  {
    collection: "top_windows",
    versionKey: false,
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    id: false,
  },
);

TopWindowSchema.index({ guildId: 1 });

export interface TopWindowData {
  _id: GuildId;
  guildId: GuildId;
  channelId: ChannelId | null;
  intervalMs: number;
  topSize: number;
  windowStartedAt: Date;
  lastReportAt: Date | null;
  emojiCounts: Record<string, number>;
  channelCounts: Record<string, number>;
  reputationDeltas: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

export type TopWindowDoc = HydratedDocument<TopWindowData>;

// Si quieres mantener el nombre “Record” para semántica de dominio:
export type TopWindowRecord = TopWindowData;

export const TopWindowModel = model<TopWindowData>(
  "TopWindow",
  TopWindowSchema,
);

/* ==============================
 * TopReport
 * ============================ */

const TopReportSchema = new Schema(
  {
    _id: { type: String, required: true }, // TopReportId
    guildId: { type: String, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    intervalMs: { type: Number, required: true },
    emojiCounts: mapOfNumbers,
    channelCounts: mapOfNumbers,
    reputationDeltas: mapOfNumbers,
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  {
    collection: "top_reports",
    versionKey: false,
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    id: false,
  },
);

TopReportSchema.index({ guildId: 1, createdAt: -1 });
TopReportSchema.index({ periodEnd: 1 });

export interface TopReportData {
  _id: TopReportId;
  guildId: GuildId;
  periodStart: Date;
  periodEnd: Date;
  intervalMs: number;
  emojiCounts: Record<string, number>;
  channelCounts: Record<string, number>;
  reputationDeltas: Record<string, number>;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export type TopReportDoc = HydratedDocument<TopReportData>;

// Alias semántico si lo usas como “record” de dominio
export type TopReportRecord = TopReportData;

export const TopReportModel = model<TopReportData>(
  "TopReport",
  TopReportSchema,
);

export const TOP_DEFAULTS = {
  intervalMs: DEFAULT_TOP_INTERVAL_MS,
  topSize: DEFAULT_TOP_SIZE,
};
