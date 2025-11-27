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
import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const DEFAULT_TOP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const DEFAULT_TOP_SIZE = 10;

const mapOfNumbers = { type: Map, of: Number, default: {} };

const TopWindowSchema = new Schema(
  {
    _id: { type: String, required: true }, // guildId
    guildId: { type: String, required: true },
    channelId: { type: String, default: null },
    intervalMs: { type: Number, required: true, default: DEFAULT_TOP_INTERVAL_MS },
    topSize: { type: Number, required: true, default: DEFAULT_TOP_SIZE },
    windowStartedAt: { type: Date, required: true, default: () => new Date() },
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
  },
);

TopWindowSchema.virtual("id").get(function virtualId(this: { _id: string }) {
  return this._id;
});
TopWindowSchema.index({ guildId: 1 });

export type TopWindowDoc = InferSchemaType<typeof TopWindowSchema> & {
  id: string;
};

export const TopWindowModel = model<TopWindowDoc>("TopWindow", TopWindowSchema);

const TopReportSchema = new Schema(
  {
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
  },
);

TopReportSchema.virtual("id").get(function virtualId(this: { _id: Types.ObjectId }) {
  return this._id.toString();
});
TopReportSchema.index({ guildId: 1, createdAt: -1 });
TopReportSchema.index({ periodEnd: 1 });

export type TopReportDoc = InferSchemaType<typeof TopReportSchema> & {
  id: string;
};

export const TopReportModel = model<TopReportDoc>("TopReport", TopReportSchema);

export const TOP_DEFAULTS = {
  intervalMs: DEFAULT_TOP_INTERVAL_MS,
  topSize: DEFAULT_TOP_SIZE,
};
