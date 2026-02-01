/**
 * Motivación: registrar el comando "moderation / tickets / config" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import {
  createChannelOption,
  Declare,
  type GuildCommandContext,
  Options,
  SubCommand,
  Middlewares,
} from "seyfert";
import { ChannelType } from "seyfert/lib/types";

import { GuildStore } from "@/db/repositories/guilds";
import { Guard } from "@/middlewares/guards/decorator";
import { ensureTicketMessage } from "@/systems/tickets";

const options = {
  // Canal de tickets
  channel: createChannelOption({
    description: "Canal donde se enviara el mensaje de tickets",
    required: true,
    channel_types: [ChannelType.GuildText],
  }),

  // Categoría donde se crearán los tickets
  category: createChannelOption({
    description: "Categoría donde se crearán los tickets",
    required: true,
    channel_types: [ChannelType.GuildCategory],
  }),

  // Canal de logs de tickets
  logchannel: createChannelOption({
    description: "Canal donde se enviaran los logs de los tickets",
    required: true,
    channel_types: [ChannelType.GuildText],
  }),
};

@Declare({
  name: "config",
  description: "Configurar el sistema de tickets",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
})
@Options(options)
@Guard({
  guildOnly: true,
})
@Middlewares(["guard"])
export default class ConfigTicketsCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const {
      channel: tickets,
      category: ticketCategory,
      logchannel: ticketLogs,
    } = ctx.options;

    const guildId = ctx.guildId;

    // Ensure guild row exists
    await GuildStore.ensure(guildId);

    const { configStore, ConfigurableModule } = await import("@/configuration");

    // Save using the new config store
    // The schema expects { tickets: {channelId: string}, ... }
    await configStore.set(guildId, ConfigurableModule.Tickets, {
      tickets: { channelId: tickets.id },
      ticketCategory: { channelId: ticketCategory.id },
      ticketLogs: { channelId: ticketLogs.id },
    });

    // Debug: read back stored values
    const config = await configStore.get(guildId, ConfigurableModule.Tickets);

    console.log("Datos guardados en la base de datos:");
    console.log("Canal de tickets:", config.tickets);
    console.log("Canal de logs de tickets:", config.ticketLogs);
    console.log("Categoría de tickets:", config.ticketCategory);

    // Cuando se actualiza el canal de tickets, asegurarse de que el mensaje de tickets exista.
    await ensureTicketMessage(ctx.client).catch(() => {
      // no hacer nada si falla; el mensaje se intentará crear en el próximo reinicio o reconfiguración
    });

    await ctx.write({
      content: "Configuración de tickets guardada correctamente.",
    });
  }
}
