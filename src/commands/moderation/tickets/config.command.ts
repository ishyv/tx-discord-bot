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
import { requireGuildId, requireGuildPermission } from "@/utils/commandGuards";

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
})
@Options(options)
export default class ConfigTicketsCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const { channel, category, logchannel: logChannel } = ctx.options;

    const guildId = await requireGuildId(ctx);
    if (!guildId) return;

    const allowed = await requireGuildPermission(ctx, {
      guildId,
      permissions: ["ManageGuild"],
    });
    if (!allowed) return;

    // Ensure guild row exists
    await repo.ensureGuild(guildId);

    // Save core channels using the flat repo
    await repo.setCoreChannel(guildId, "tickets", channel.id);
    await repo.setCoreChannel(guildId, "ticketLogs", logChannel.id);
    await repo.setCoreChannel(guildId, "ticketCategory", category.id);

    // Debug: read back stored values
    const ticketChannel = await repo.getCoreChannel(guildId, "tickets");
    const ticketLogs = await repo.getCoreChannel(guildId, "ticketLogs");
    const ticketCategory = await repo.getCoreChannel(guildId, "ticketCategory");

    console.log("Datos guardados en la base de datos:");
    console.log("Canal de tickets:", ticketChannel);
    console.log("Canal de logs de tickets:", ticketLogs);
    console.log("Categoría de tickets:", ticketCategory);

    await ctx.write({
      content: "Configuración de tickets guardada correctamente.",
    });
  }
}

