/**
 * Zod schemas for TOPs windows/reports.
 * Purpose: define persisted shapes/defaults for validation in repos.
 */
import { z } from "zod";

export const TOP_DEFAULTS = {
  intervalMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  topSize: 10,
};

export const NumberMapSchema = z.record(z.string(), z.number()).default({});

export const TopWindowSchema = z.object({
  _id: z.string(),
  guildId: z.string(),
  channelId: z.string().nullable().default(null),
  intervalMs: z.number().int().positive().default(() => TOP_DEFAULTS.intervalMs),
  topSize: z.number().int().positive().default(() => TOP_DEFAULTS.topSize),
  windowStartedAt: z.date().default(() => new Date()),
  lastReportAt: z.date().nullable().default(null),
  emojiCounts: NumberMapSchema.default(() => ({})),
  channelCounts: NumberMapSchema.default(() => ({})),
  reputationDeltas: NumberMapSchema.default(() => ({})),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const TopReportSchema = z.object({
  _id: z.string().optional(),
  guildId: z.string(),
  periodStart: z.date(),
  periodEnd: z.date(),
  intervalMs: z.number().int(),
  emojiCounts: NumberMapSchema,
  channelCounts: NumberMapSchema,
  reputationDeltas: NumberMapSchema,
  metadata: z.record(z.string(), z.unknown()).nullable().default(null),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type TopWindow = z.infer<typeof TopWindowSchema>;
export type TopReport = z.infer<typeof TopReportSchema>;
