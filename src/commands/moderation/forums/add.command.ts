/**
 * Motivación: registrar el comando "moderation / forums / add" para añadir foros monitoreados.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega la persistencia al config store.
 */
import type { GuildCommandContext } from "seyfert";
import {
  Declare,
  Options,
  SubCommand,
  createChannelOption,
  Middlewares,
} from "seyfert";
import { ChannelType } from "seyfert/lib/types";

import { configStore, ConfigurableModule } from "@/configuration";
import { Guard } from "@/middlewares/guards/decorator";

const options = {
  foro: createChannelOption({
    description: "Foro de Discord a monitorear",
    required: true,
    channel_types: [ChannelType.GuildForum],
  }),
};

@Declare({
  name: "add",
  description: "Agregar un foro monitoreado para respuestas automáticas (IA)",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
})
@Options(options)
@Guard({
  guildOnly: true,
})
@Middlewares(["guard"])
export default class ForumsAddCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;

    const forum = ctx.options.foro;
    if (!forum || forum.type !== ChannelType.GuildForum) {
      await ctx.write({ content: "Debes elegir un canal de tipo foro válido." });
      return;
    }

    const { forumIds } = await configStore.get(
      guildId,
      ConfigurableModule.ForumAutoReply,
    );

    if (forumIds.includes(forum.id)) {
      await ctx.write({
        content: `El foro <#${forum.id}> ya está configurado.`,
      });
      return;
    }

    const next = Array.from(new Set([...forumIds, forum.id]));
    await configStore.set(guildId, ConfigurableModule.ForumAutoReply, {
      forumIds: next,
    });

    await ctx.write({
      content: `Foro agregado: <#${forum.id}>. Total: ${next.length}.`,
    });
  }
}
