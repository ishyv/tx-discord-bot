/**
 * Motivación: registrar el comando "utility / suggest" dentro de la categoría utility para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import type { CommandContext, GuildCommandContext } from "seyfert";
import {
  Command,
  createStringOption,
  Declare,
  Embed,
  Middlewares,
  Options,
} from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { CHANNELS_ID } from "@/constants/guild";
import { getGuildChannels } from "@/modules/guild-channels";
import { BindDisabled, Features } from "@/modules/features";

const options = {
  suggest: createStringOption({
    description: "¿qué tienes en mente para el servidor?",
    min_length: 16,
    required: true,
  }),
};

@Declare({
  name: "sugerir",
  description: "Sugerir mejoras para el servidor",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@Cooldown({
  type: CooldownType.User,
  interval: 5_000 * 60,
  uses: {
    default: 1,
  },
})
@Middlewares(["cooldown"])
@Options(options)
@BindDisabled(Features.Suggest)
export default class SuggestCommand extends Command {
  async run(ctx: GuildCommandContext<typeof options>) {
    const { suggest } = ctx.options;

    if (!suggest) {
      console.error("Suggest: no se pudo obtener sugerencia.");
      return;
    }

    const guildId = ctx.guildId;
    if (!guildId) {
      console.error("Suggest: no se pudo obtener ID de la guild.");
      return;
    }

    const channels = await getGuildChannels(guildId);
    const suggestChannelId =
      channels.core?.suggestions?.channelId ??
      channels.managed?.suggestions?.channelId ??
      CHANNELS_ID.suggestions;

    if (!suggestChannelId) {
      console.error("Suggest: no se pudo obtener canal de sugerencias");
      return;
    }

    const suggestEmbed = new Embed({
      title: "Nueva sugerencia !",
      author: {
        name: ctx.author.username,
        icon_url: ctx.author.avatarURL(),
      },
      description: `${suggest}`,
      color: EmbedColors.Aqua,
      footer: {
        text: `Puedes votar a favor o en contra de esta sugerencia.`,
      },
    });

    const message = await ctx.client.messages.write(suggestChannelId, {
      embeds: [suggestEmbed],
    });

    await message.react("✅");
    await message.react("❌");

    try {
      const thread = await ctx.client.messages.thread(
        message.channelId,
        message.id,
        {
          name: `Sugerencia de ${ctx.author.username}`,
        },
      );

      await ctx.client.messages.write(thread.id, {
        content: `<@${ctx.member?.user.id}>`,
      });

      await ctx.write({
        content: "✅ Sugerencia enviada correctamente.",
      });

    } catch (error) {
      ctx.editOrReply({
        content: "⚠️ Han habido problemas al crear el hilo de la sugerencia. ",
      });
    }
  }

  onMiddlewaresError(context: CommandContext, error: string) {
    context.editOrReply({ content: error });
  }
}


