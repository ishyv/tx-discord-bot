/**
 * Zod schema for offers.
 * Purpose: define offer shape/defaults and validate repo reads/writes.
 */
import { z } from "zod";

export const OfferDetailsSchema = z.object({
  title: z.string(),
  description: z.string(),
  requirements: z.string().nullable().catch(null),
  workMode: z.string().nullable().catch(null),
  duration: z.string().nullable().catch(null),
  salary: z.string().nullable().catch(null),
  contact: z.string().nullable().catch(null),
  labels: z.array(z.string()).catch([]),
  location: z.string().nullable().catch(null),
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
  reviewMessageId: z.string().nullable().catch(null),
  reviewChannelId: z.string().nullable().catch(null),
  publishedMessageId: z.string().nullable().catch(null),
  publishedChannelId: z.string().nullable().catch(null),
  rejectionReason: z.string().nullable().catch(null),
  changesNote: z.string().nullable().catch(null),
  lastModeratorId: z.string().nullable().catch(null),
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

