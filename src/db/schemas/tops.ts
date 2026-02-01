/**
 * Zod schemas for TOPs windows/reports.
 * Purpose: define persisted shapes/defaults for validation in repos.
 */
import { z } from "zod";

export const TOP_DEFAULTS = {
  intervalMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  topSize: 10,
};

export const NumberMapSchema = z.record(z.string(), z.number()).catch({});

export const TopWindowSchema = z.object({
  _id: z.string(),
  guildId: z.string(),
  channelId: z.string().nullable().catch(null),
  intervalMs: z
    .number()
    .int()
    .positive()
    .catch(() => TOP_DEFAULTS.intervalMs),
  topSize: z
    .number()
    .int()
    .positive()
    .catch(() => TOP_DEFAULTS.topSize),
  windowStartedAt: z.date().catch(() => new Date()),
  lastReportAt: z.date().nullable().catch(null),
  emojiCounts: NumberMapSchema.catch(() => ({})),
  channelCounts: NumberMapSchema.catch(() => ({})),
  reputationDeltas: NumberMapSchema.catch(() => ({})),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const TopReportSchema = z.object({
  // IMPORTANT: _id is always a string in this codebase (no ObjectId in persisted docs).
  // We enforce this to keep repository types consistent and avoid runtime parse mismatches.
  _id: z.string(),
  guildId: z.string(),
  periodStart: z.date(),
  periodEnd: z.date(),
  intervalMs: z.number().int(),
  emojiCounts: NumberMapSchema,
  channelCounts: NumberMapSchema,
  reputationDeltas: NumberMapSchema,
  metadata: z.record(z.string(), z.unknown()).nullable().catch(null),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type TopWindow = z.infer<typeof TopWindowSchema>;
export type TopReport = z.infer<typeof TopReportSchema>;
