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
} from "seyfert";
import { ChannelType } from "seyfert/lib/types";

import * as repo from "@/db/repositories";
import { requireGuildId } from "@/utils/commandGuards";
import { CoreChannelNames } from "@/modules/guild-channels/constants";
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
export default class ConfigTicketsCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const { channel, category, logchannel: logChannel } = ctx.options;

    const guildId = await requireGuildId(ctx);
    if (!guildId) return;

    // Ensure guild row exists
    await repo.ensureGuild(guildId);

    // Save core channels using the flat repo
    await repo.setCoreChannel(guildId, CoreChannelNames.Tickets, channel.id);
    await repo.setCoreChannel(guildId, CoreChannelNames.TicketLogs, logChannel.id);
    await repo.setCoreChannel(guildId, CoreChannelNames.TicketCategory, category.id);

    // Debug: read back stored values
    const ticketChannel = await repo.getCoreChannel(guildId, CoreChannelNames.Tickets);
    const ticketLogs = await repo.getCoreChannel(guildId, CoreChannelNames.TicketLogs);
    const ticketCategory = await repo.getCoreChannel(guildId, CoreChannelNames.TicketCategory);

    console.log("Datos guardados en la base de datos:");
    console.log("Canal de tickets:", ticketChannel);
    console.log("Canal de logs de tickets:", ticketLogs);
    console.log("Categoría de tickets:", ticketCategory);

    // Cuando se actualiza el canal de tickets, asegurarse de que el mensaje de tickets exista.
    await ensureTicketMessage(ctx.client).catch(() => {
      // no hacer nada si falla; el mensaje se intentará crear en el próximo reinicio o reconfiguración
    });

    await ctx.write({
      content: "Configuración de tickets guardada correctamente.",
    });
  }
}

