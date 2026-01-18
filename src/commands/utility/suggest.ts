/**
 * Motivación: registrar el comando "utility / suggest" dentro de la categoría utility para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import type { CommandContext, GuildCommandContext, UsingClient } from "seyfert";
import {
  Command,
  createStringOption,
  Declare,
  Embed,
  Options,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { EmbedColors } from "seyfert/lib/common";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { CHANNELS_ID } from "@/constants/guild";
import { updateGuildPaths } from "@/db/repositories/guilds";
import { getGuildChannels } from "@/modules/guild-channels";
import { BindDisabled, Features } from "@/modules/features";
import { fetchStoredChannel } from "@/utils/channelGuard";

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
@Options(options)
@BindDisabled(Features.Suggest)
export default class SuggestCommand extends Command {
  async run(ctx: GuildCommandContext<typeof options>) {
    const suggestion = ctx.options.suggest?.trim();
    if (!suggestion) {
      await ctx.write({
        content: "Necesitas escribir una sugerencia antes de enviarla.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        content: "Este comando solo funciona dentro de un servidor.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const suggestChannelId = await resolveSuggestChannel(ctx.client, guildId);
    if (!suggestChannelId) {
      await ctx.write({
        content:
          "No hay un canal de sugerencias configurado. Un administrador puede configurarlo en el panel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const suggestEmbed = new Embed({
      title: "Nueva sugerencia !",
      author: {
        name: ctx.author.username,
        icon_url: ctx.author.avatarURL(),
      },
      description: suggestion,
      color: EmbedColors.Aqua,
      footer: {
        text: "Puedes votar a favor o en contra de esta sugerencia.",
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
      console.error("[Suggest] Error creando hilo de sugerencia:", error);
      await ctx.editOrReply({
        content: "⚠️ Ocurrió un problema al crear el hilo de la sugerencia.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  onMiddlewaresError(context: CommandContext, error: string) {
    context.editOrReply({ content: error });
  }
}

async function resolveSuggestChannel(
  client: UsingClient,
  guildId: string,
): Promise<string | null> {
  const channels = await getGuildChannels(guildId);
  const core = channels.core as Record<string, { channelId: string } | null | undefined>;
  const managed = channels.managed as Record<string, { channelId: string } | null | undefined>;
  const coreChannelId = core?.suggestions?.channelId ?? null;
  if (coreChannelId) {
    const fetched = await fetchStoredChannel(client, coreChannelId, () =>
      updateGuildPaths(guildId, {
        "channels.core.suggestions": null,
      }),
    );
    if (fetched.channel && fetched.channelId) {
      if (!fetched.channel.isTextGuild()) {
        return null;
      }
      return fetched.channelId;
    }
    if (!fetched.missing) {
      return null;
    }
  }

  const managedChannelId = managed?.suggestions?.channelId ?? null;
  if (managedChannelId) {
    const fetched = await fetchStoredChannel(client, managedChannelId, () =>
      updateGuildPaths(guildId, {}, { unset: ["channels.managed.suggestions"] }),
    );
    if (fetched.channel && fetched.channelId) {
      if (!fetched.channel.isTextGuild()) {
        return null;
      }
      return fetched.channelId;
    }
    if (!fetched.missing) {
      return null;
    }
  }

  return CHANNELS_ID.suggestions ?? null;
}


