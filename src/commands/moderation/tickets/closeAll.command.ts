/**
 * Motivación: registrar el comando "moderation / tickets / close All" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import {
  Declare,
  type GuildCommandContext,
  SubCommand,
  Middlewares,
} from "seyfert";

import { GuildStore } from "@/db/repositories/guilds";
import { closeTicket } from "@/systems/tickets/shared";
import { Guard } from "@/middlewares/guards/decorator";

@Declare({
  name: "close-all",
  description: "Cerrar todos los tickets abiertos en el servidor",
  contexts: ["Guild"],
})
@Guard({
  guildOnly: true,
  permissions: ["ManageChannels"],
})
@Middlewares(["guard"])
export default class ConfigTicketsCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const guildId = ctx.guildId;

    // Ensure guild row exists
    const res = await GuildStore.ensure(guildId);

    // Fetch all pending tickets
    const guild = res.unwrap();
    const pendingTickets = (guild?.pendingTickets ?? []) as string[];

    // TODO: Generate transcript before closing

    // Close each ticket channel
    for (const ticketChannelId of pendingTickets) {
      let channelDeleted = false;
      try {
        const channel = await ctx.client.channels.fetch(ticketChannelId);
        if (!channel) {
          channelDeleted = true;
        } else {
          await ctx.client.channels.delete(channel.id);
          channelDeleted = true;
        }
      } catch (error) {
        const code =
          typeof error === "object" &&
          error &&
          "code" in (error as Record<string, unknown>)
            ? Number((error as { code?: number }).code)
            : undefined;

        if (code === 10003) {
          channelDeleted = true; // channel already removed
        } else {
          ctx.client.logger?.error?.(
            "[tickets] failed to close ticket channel",
            {
              error,
              ticketChannelId,
            },
          );
        }
      }

      if (channelDeleted) {
        await closeTicket(guildId, ticketChannelId);
      }
    }

    await ctx.write({
      content: "Todos los tickets abiertos han sido cerrados.",
    });
  }
}
