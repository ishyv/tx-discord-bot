/**
 * Motivación: normalizar el manejo de canales de guild (constants) para reducir wiring repetitivo.
 *
 * Idea/concepto: agrupa constantes y helpers para crear/consultar canales de forma segura.
 *
 * Alcance: utilidades para canales; no configura permisos detallados ni políticas de moderación.
 */


/**
 * Catalogo central de canales obligatorios: alinea la configuracion en DB
 * con los identificadores fijos definidos en CHANNELS_ID.
 */
export const CORE_CHANNEL_DEFINITIONS: Record<string, string> =
{
  // Pares de: identificar : descripción humana del canal
  "messageLogs": "Registro de mensajes moderados",
  "voiceLogs": "Registro de actividad en voz",
  "ticketLogs": "Seguimiento de tickets",
  "tickets": "Canal de tickets",
  "ticketCategory": "Categoría de tickets",
  "pointsLog": "Log de puntos",
  "generalLogs": "Eventos generales del servidor",
  "banSanctions": "Historial de sanciones",
  "staff": "Alertas para el staff",
  "suggestions": "Sugerencias",
  "repRequests": "Solicitudes de Reputación",
};


export type CoreChannelName = keyof typeof CORE_CHANNEL_DEFINITIONS