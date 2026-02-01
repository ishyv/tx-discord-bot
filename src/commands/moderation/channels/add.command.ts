/**
 * Motivación: registrar el comando "moderation / channels / add" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import type { GuildCommandContext } from "seyfert";
import {
  Declare,
  Embed,
  Options,
  SubCommand,
  createChannelOption,
  createStringOption,
  Middlewares,
} from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import {
  addManagedChannel,
  removeInvalidChannels,
} from "@/modules/guild-channels";
import { Guard } from "@/middlewares/guards/decorator";

const options = {
  label: createStringOption({
    description: "Descripcion corta del canal",
    required: true,
  }),
  channel: createChannelOption({
    description: "Canal de Discord a registrar",
    required: true,
  }),
};

// Registra un canal auxiliar definido por el staff.
@Declare({
  name: "add",
  description: "Registrar un canal opcional",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
})
@Options(options)
@Guard({
  guildOnly: true,
})
@Middlewares(["guard"])
export default class ChannelAddCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;

    // Remueve los canales invalidos antes de proceder.
    await removeInvalidChannels(guildId, ctx.client);

    const label = ctx.options.label;
    const channelId = String(ctx.options.channel.id);

    const record = await addManagedChannel(guildId, label, channelId);

    const embed = new Embed({
      title: "Canal opcional registrado",
      description: `Se asigno <#${record.channelId}> con etiqueta **${record.label}**`,
      color: EmbedColors.Green,
      fields: [
        {
          name: "Identificador",
          value: record.id,
        },
      ],
    });

    await ctx.write({ embeds: [embed] });
  }
}
