/**
 * Motivación: estructurar el módulo offers (types) en piezas reutilizables y autocontenidas.
 *
 * Idea/concepto: agrupa helpers y orquestadores bajo un mismo dominio para evitar acoplamientos dispersos.
 *
 * Alcance: soporte de dominio; no sustituye a los comandos o servicios que consumen el módulo.
 */
import type { Offer, OfferDetails, OfferStatus } from "@/db/schemas/offers";

export type { Offer, OfferDetails, OfferStatus };

export const ACTIVE_STATUSES: OfferStatus[] = [
  "PENDING_REVIEW",
  "CHANGES_REQUESTED",
];

export const OFFER_FINAL_STATUSES: OfferStatus[] = [
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
];

export interface OfferCreateParams {
  guildId: string;
  authorId: string;
  details: OfferDetails;
}

export interface OfferEditParams {
  offerId: string;
  details: OfferDetails;
}

export interface ModerationActionContext {
  moderatorId: string;
  reason?: string | null;
}

export interface PublishResult {
  reviewMessageUpdated: boolean;
  publishedMessageId?: string | null;
  publishedChannelId?: string | null;
}
