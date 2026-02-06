/**
 * Motivación: normalizar el manejo de canales de guild (constants) para reducir wiring repetitivo.
 *
 * Idea/concepto: agrupa constantes y helpers para crear/consultar canales de forma segura.
 *
 * Alcance: utilidades para canales; no configura permisos detallados ni políticas de moderación.
 */

/**
 * Catalogo de nombres fijos para canales obligatorios.
 * Q: Por que usar un enum en lugar de solo strings?
 * A: Porque si uno de los identificadores cambia, es mas facil actualizarlo en un solo lugar.
 * Si se usaran strings sueltos en el codigo, se podria romper la consistencia. A la hora de referenciar
 * estos canales en otros modulos, usar <CoreChannelNames.NombreDelChannel> asegura que siempre se use
 * el mismo identificador.
 */
export enum CoreChannelNames {
  MessageLogs = "messageLogs",
  VoiceLogs = "voiceLogs",
  TicketLogs = "ticketLogs",
  Tickets = "tickets",
  TicketCategory = "ticketCategory",
  PointsLog = "pointsLog",
  GeneralLogs = "generalLogs",
  BanSanctions = "banSanctions",
  Staff = "staff",
  Suggestions = "suggestions",
  RepRequests = "repRequests",
  OffersReview = "offersReview",
  ApprovedOffers = "approvedOffers",
}

/**
 * Catalogo central de canales obligatorios: alinea la configuracion en DB
 * con los identificadores fijos definidos en CHANNELS_ID.
 */
export const CORE_CHANNEL_DEFINITIONS: Record<string, string> = {
  // Pares de: identificar : descripción humana del canal
  [CoreChannelNames.MessageLogs]: "Moderation message logs",
  [CoreChannelNames.VoiceLogs]: "Voice activity logs",
  [CoreChannelNames.TicketLogs]: "Ticket tracking logs",
  [CoreChannelNames.Tickets]: "Ticket channel",
  [CoreChannelNames.TicketCategory]: "Ticket category",
  [CoreChannelNames.PointsLog]: "Points log",
  [CoreChannelNames.GeneralLogs]: "General Server Events",
  [CoreChannelNames.BanSanctions]: "Sanction history",
  [CoreChannelNames.Staff]: "Staff alerts",
  [CoreChannelNames.Suggestions]: "Suggestions",
  [CoreChannelNames.RepRequests]: "Reputation Requests",
  [CoreChannelNames.OffersReview]: "Job offer review",
  [CoreChannelNames.ApprovedOffers]: "Approved offers publication",
};

export type CoreChannelName = keyof typeof CORE_CHANNEL_DEFINITIONS;


