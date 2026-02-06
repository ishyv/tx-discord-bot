/**
 * Utilidades compartidas del sistema de tickets (sin UI ni comandos).
 * Encaje: orquesta sincronización de estado en repos cuando se cierra un ticket.
 * Dependencias: `recordTicketClosure` en módulo de dominio.
 */
import { recordTicketClosure } from "@/modules/tickets/service";

/**
 * Cierra un ticket a nivel de estado (guild + users) de forma tolerante a fallos.
 * Side effects: invoca `recordTicketClosure` que limpia `pendingTickets` y
 * referencias en `openTickets`.
 * Gotchas: pensado para llamarse después de eliminar el canal en Discord; si el
 * repositorio falla, se loguea y continúa.
 */
export async function closeTicket(
  guildId: string,
  channelId: string,
): Promise<void> {
  const result = await recordTicketClosure(guildId, channelId);
  if (result.isErr()) {
    console.error("[tickets] failed to update ticket state during close", {
      error: result.error,
      guildId,
      channelId,
    });
  }
}

