/**
 * Marketplace listing schema.
 *
 * Purpose: Runtime validation + repair for persisted market listings.
 */

import { z } from "zod";
import { MARKET_CATEGORIES } from "./types";

const MarketCategorySchema = z.enum(MARKET_CATEGORIES);
const MarketItemKindSchema = z.enum(["stackable", "instance"]);
const MarketListingStatusSchema = z.enum([
  "active",
  "sold_out",
  "cancelled",
  "expired",
]);

const EscrowInstanceSchema = z.object({
  instanceId: z.string(),
  itemId: z.string(),
  durability: z.number().int().min(0),
});

export const MarketListingSchema = z.object({
  _id: z.string(),
  guildId: z.string(),
  sellerId: z.string(),
  itemId: z.string(),
  itemKind: MarketItemKindSchema,
  currencyId: z.literal("coins").catch("coins"),
  pricePerUnit: z.number().int().min(1),
  quantity: z.number().int().min(0),
  instanceIds: z.array(z.string()).optional(),
  escrowInstances: z.array(EscrowInstanceSchema).optional(),
  category: MarketCategorySchema.optional(),
  createdAt: z.coerce.date().catch(() => new Date()),
  updatedAt: z.coerce.date().catch(() => new Date()),
  expiresAt: z.coerce.date().nullable().optional(),
  status: MarketListingStatusSchema.catch("active"),
  version: z.number().int().min(0).catch(0),
});

export type MarketListingDoc = z.infer<typeof MarketListingSchema>;

export function repairMarketListing(input: unknown): MarketListingDoc {
  const safeInput =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  return MarketListingSchema.parse({
    _id:
      typeof safeInput._id === "string"
        ? safeInput._id
        : `ml_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    guildId: typeof safeInput.guildId === "string" ? safeInput.guildId : "unknown",
    sellerId:
      typeof safeInput.sellerId === "string" ? safeInput.sellerId : "unknown",
    itemId: typeof safeInput.itemId === "string" ? safeInput.itemId : "unknown",
    itemKind: safeInput.itemKind === "instance" ? "instance" : "stackable",
    currencyId: "coins",
    pricePerUnit:
      typeof safeInput.pricePerUnit === "number" && safeInput.pricePerUnit >= 1
        ? Math.trunc(safeInput.pricePerUnit)
        : 1,
    quantity:
      typeof safeInput.quantity === "number" && safeInput.quantity >= 0
        ? Math.trunc(safeInput.quantity)
        : 0,
    instanceIds: Array.isArray(safeInput.instanceIds)
      ? safeInput.instanceIds.filter((entry): entry is string => typeof entry === "string")
      : [],
    escrowInstances: Array.isArray(safeInput.escrowInstances)
      ? safeInput.escrowInstances
      : [],
    createdAt: safeInput.createdAt ?? new Date(),
    updatedAt: new Date(),
    expiresAt: safeInput.expiresAt ?? null,
    status: safeInput.status,
    version:
      typeof safeInput.version === "number" && safeInput.version >= 0
        ? Math.trunc(safeInput.version)
        : 0,
  });
}
