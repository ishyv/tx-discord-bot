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
 * estos canales en otros modulos, usar <CoreChannelNames.NombreDelCanal> asegura que siempre se use
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
export const CORE_CHANNEL_DEFINITIONS: Record<string, string> =
{
  // Pares de: identificar : descripción humana del canal
  [CoreChannelNames.MessageLogs]: "Registro de mensajes moderados",
  [CoreChannelNames.VoiceLogs]: "Registro de actividad en voz",
  [CoreChannelNames.TicketLogs]: "Seguimiento de tickets",
  [CoreChannelNames.Tickets]: "Canal de tickets",
  [CoreChannelNames.TicketCategory]: "Categoría de tickets",
  [CoreChannelNames.PointsLog]: "Log de puntos",
  [CoreChannelNames.GeneralLogs]: "Eventos generales del servidor",
  [CoreChannelNames.BanSanctions]: "Historial de sanciones",
  [CoreChannelNames.Staff]: "Alertas para el staff",
  [CoreChannelNames.Suggestions]: "Sugerencias",
  [CoreChannelNames.RepRequests]: "Solicitudes de Reputación",
  [CoreChannelNames.OffersReview]: "Revisión de ofertas laborales",
  [CoreChannelNames.ApprovedOffers]: "Publicación de ofertas aprobadas",
};


export type CoreChannelName = keyof typeof CORE_CHANNEL_DEFINITIONS;
