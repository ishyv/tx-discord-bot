/**
 * Motivación: registrar el comando "moderation / channels / remove" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
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
  createStringOption,
} from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import { removeInvalidChannels, removeManagedChannel } from "@/modules/guild-channels";
import { requireGuildId } from "@/utils/commandGuards";

const options = {
  id: createStringOption({
    description: "Identificador del canal opcional",
    required: true,
  }),
};

// Elimina un canal opcional previamente registrado.
@Declare({
  name: "remove",
  description: "Eliminar un canal opcional",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
})
@Options(options)
export default class ChannelRemoveCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = await requireGuildId(ctx);
    if (!guildId) return;

    const identifier = ctx.options.id.trim();
    if (!identifier) {
      await ctx.write({ content: "[!] Debes indicar un identificador valido." });
      return;
    }

    // Remueve los canales invalidos antes de proceder.
    await removeInvalidChannels(guildId, ctx.client);

    const removed = await removeManagedChannel(guildId, identifier);

    if (!removed) {
      await ctx.write({ content: "[!] No se encontro un canal con ese identificador." });
      return;
    }

    const embed = new Embed({
      title: "Canal opcional eliminado",
      description: `Se elimino la referencia **${identifier}**`,
      color: EmbedColors.Red,
    });

    await ctx.write({ embeds: [embed] });
  }
}

