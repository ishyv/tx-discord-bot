/**
 * Motivación: definir el contrato de datos offers para asegurar que el resto del código consuma estructuras consistentes.
 *
 * Idea/concepto: usa tipos/interfaces para describir campos esperados y su intención en el dominio de ofertas moderadas.
 *
 * Alcance: solo declara formas de datos; no valida en tiempo de ejecución ni persiste información.
 */
/** Estados que recorre una oferta durante su ciclo de vida. */
export const offerStatus = {
  enumValues: [
    "PENDING_REVIEW",
    "APPROVED",
    "REJECTED",
    "CHANGES_REQUESTED",
    "WITHDRAWN",
  ] as const,
};

export type OfferStatus = (typeof offerStatus.enumValues)[number];

/** Datos que el autor provee para construir el embed de la oferta. */
export interface OfferDetails {
  title: string;
  description: string;
  requirements?: string | null;
  workMode?: string | null;
  duration?: string | null;
  salary?: string | null;
  contact?: string | null;
  labels?: string[] | null;
  location?: string | null;
}

/** Representación persistida de una oferta moderada. */
export interface Offer {
  id: string;
  guildId: string;
  authorId: string;
  status: OfferStatus;
  details: OfferDetails;
  embed: any;
  reviewMessageId: string | null;
  reviewChannelId: string | null;
  publishedMessageId: string | null;
  publishedChannelId: string | null;
  rejectionReason: string | null;
  changesNote: string | null;
  lastModeratorId: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
