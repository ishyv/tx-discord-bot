/**
 * Zod schema for offers.
 * Purpose: define offer shape/defaults and validate repo reads/writes.
 */
import { z } from "zod";

export const OfferDetailsSchema = z.object({
  title: z.string(),
  description: z.string(),
  requirements: z.string().nullable().default(null),
  workMode: z.string().nullable().default(null),
  duration: z.string().nullable().default(null),
  salary: z.string().nullable().default(null),
  contact: z.string().nullable().default(null),
  labels: z.array(z.string()).default([]),
  location: z.string().nullable().default(null),
});

export const OfferStatusSchema = z.enum([
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "CHANGES_REQUESTED",
  "WITHDRAWN",
]);

const OfferBaseSchema = z.object({
  _id: z.string(),
  guildId: z.string(),
  authorId: z.string(),
  status: OfferStatusSchema,
  details: OfferDetailsSchema,
  embed: z.unknown(),
  reviewMessageId: z.string().nullable().default(null),
  reviewChannelId: z.string().nullable().default(null),
  publishedMessageId: z.string().nullable().default(null),
  publishedChannelId: z.string().nullable().default(null),
  rejectionReason: z.string().nullable().default(null),
  changesNote: z.string().nullable().default(null),
  lastModeratorId: z.string().nullable().default(null),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const OfferSchema = OfferBaseSchema.transform((data) => ({
  ...data,
  id: data._id,
}));

export type Offer = z.infer<typeof OfferBaseSchema> & { id: string };
export type OfferStatus = z.infer<typeof OfferStatusSchema>;
export type OfferDetails = z.infer<typeof OfferDetailsSchema>;
