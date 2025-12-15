/**
 * Motivación: implementar el sistema tickets (shared) para automatizar ese dominio sin duplicar lógica.
 *
 * Idea/concepto: organiza orquestadores y helpers específicos que combinan servicios, repositorios y eventos.
/**
 * Motivación: implementar el sistema tickets (shared) para automatizar ese dominio sin duplicar lógica.
 *
 * Idea/concepto: organiza orquestadores y helpers específicos que combinan servicios, repositorios y eventos.
 *
 * Alcance: resuelve flujos del sistema; no define comandos ni middleware transversales.
 */
import { recordTicketClosure } from "@/modules/tickets/service";

/**
 * Synchronises repository state when a ticket channel is closed.
 * Removes the channel from the guild pending list and from any user
 * that still references it inside `openTickets`.
 */
export async function closeTicket(guildId: string, channelId: string): Promise<void> {
  const result = await recordTicketClosure(guildId, channelId);
  if (result.isErr()) {
    console.error("[tickets] failed to update ticket state during close", {
      error: result.error,
      guildId,
      channelId,
    });
  }
}
