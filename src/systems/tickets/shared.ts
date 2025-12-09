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
import { removeOpenTicketByChannel } from "@/db/repositories";
import { withGuild } from "@/db/repositories/with_guild";

/**
 * Synchronises repository state when a ticket channel is closed.
 * Removes the channel from the guild pending list and from any user
 * that still references it inside `openTickets`.
 */
export async function closeTicket(guildId: string, channelId: string): Promise<void> {
  await withGuild(guildId, (guild) => {
    const pending = Array.isArray((guild as any).pendingTickets)
      ? [...(guild as any).pendingTickets]
      : [];
    const next = pending.filter((id: string | null | undefined) => id && id !== channelId);
    (guild as any).pendingTickets = next;
    return next;
  }).catch((error) => {
    console.error("[tickets] failed to update pending tickets during close", {
      error,
      guildId,
      channelId,
    });
  });

  await removeOpenTicketByChannel(channelId).catch((error) => {
    console.error("[tickets] failed to update user open tickets during close", {
      error,
      channelId,
    });
  });
}
