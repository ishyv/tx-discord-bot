/**
 * Motivación: registrar el comando "moderation / channels / list" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import type { GuildCommandContext } from "seyfert";
import { Declare, Embed, SubCommand, Middlewares } from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import {
  CORE_CHANNEL_DEFINITIONS,
  getGuildChannels,
  removeInvalidChannels,
} from "@/modules/guild-channels";
import { Guard } from "@/middlewares/guards/decorator";

function formatChannelMention(channelId: string): string {
  return channelId ? `<#${channelId}>` : "Sin canal";
}

// Lista los canales core y opcionales actualmente vinculados.
@Declare({
  name: "list",
  description: "Mostrar el estado de los canales configurados",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
})
@Guard({
  guildOnly: true,
})
@Middlewares(["guard"])
export default class ChannelListCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const guildId = ctx.guildId;

    // Remueve los canales invalidos antes de proceder.
    await removeInvalidChannels(guildId, ctx.client);

    const guild_channels_record = await getGuildChannels(guildId);

    const coreLines = Object.entries(CORE_CHANNEL_DEFINITIONS).map(([name, label]) => {
      const entry = guild_channels_record.core?.[name] as { channelId: string } | null | undefined;
      if (!entry) {
        return `**${name}** (${label}) -> Sin canal`;
      }
      return `**${name}** (${label}) -> ${formatChannelMention(entry.channelId)}`;
    }).join("\n\n");

    const managedEntries = Object.values(guild_channels_record.managed ?? {}) as any[];
    const managedLines = managedEntries.length
      ? managedEntries
        .map((entry) => `**${entry.id}** (${entry.label}) -> ${formatChannelMention(entry.channelId)}`)
        .join("\n")
      : "Sin canales opcionales configurados.";

    const embed = new Embed({
      title: "Configuracion de canales",
      color: EmbedColors.Blurple,
      fields: [
        {
          name: "Canales requeridos",
          value: coreLines,
        },
        {
          name: "Canales opcionales",
          value: managedLines,
        },
      ],
    });

    await ctx.write({ embeds: [embed] });
  }
}

