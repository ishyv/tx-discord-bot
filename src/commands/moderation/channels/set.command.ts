/**
 * Motivación: registrar el comando "moderation / channels / set" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
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
} from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import {
  CORE_CHANNEL_DEFINITIONS,
  type CoreChannelName,
  removeInvalidChannels,
  setCoreChannel,
} from "@/modules/guild-channels";
import { requireGuildId } from "@/utils/commandGuards";
import { CoreChannelNames } from "@/modules/guild-channels/constants";
import { ensureTicketMessage } from "@/systems/tickets";

const nameChoices = Object.entries(CORE_CHANNEL_DEFINITIONS).map(([name, label]) => ({
  name: `${name} (${label})`,
  value: name,
}));

const options = {
  name: createStringOption({
    description: "Nombre del canal requerido",
    required: true,
    choices: nameChoices,
  }),
  channel: createChannelOption({
    description: "Canal de Discord a asociar",
    required: true,
  }),
};

// Actualiza la referencia de un canal core obligatorio.
@Declare({
  name: "set",
  description: "Actualizar uno de los canales requeridos",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
})
@Options(options)
export default class ChannelSetCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = await requireGuildId(ctx);
    if (!guildId) return;

    // Remueve los canales invalidos antes de proceder.
    await removeInvalidChannels(guildId, ctx.client);

    const name = ctx.options.name as CoreChannelName;
    const channelId = String(ctx.options.channel.id);

    const record = await setCoreChannel(guildId, name, channelId);

    // Cuando se actualiza el canal de tickets, asegurarse de que el mensaje de tickets exista.
    if (name === CoreChannelNames.Tickets) {
      await ensureTicketMessage(ctx.client).catch(() => {
        // no hacer nada si falla; el mensaje se intentará crear en el próximo reinicio o reconfiguración
      });
    }

    const embed = new Embed({
      title: "Canal actualizado",
      description: `Se asigno <#${record.channelId}> a **${name}** (${CORE_CHANNEL_DEFINITIONS[name]})`,
      color: EmbedColors.Green,
    });

    await ctx.write({ embeds: [embed] });
  }
}

