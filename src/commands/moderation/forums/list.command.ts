/**
 * Motivación: registrar el comando "moderation / forums / list" para listar foros monitoreados.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert para mostrar el estado actual.
 *
 * Alcance: maneja la invocación y respuesta del comando; no modifica la configuración.
 */
import type { GuildCommandContext } from "seyfert";
import { Declare, Embed, SubCommand } from "seyfert";
import { EmbedColors } from "seyfert/lib/common";

import { configStore, ConfigurableModule } from "@/configuration";
import { requireGuildId } from "@/utils/commandGuards";

@Declare({
  name: "list",
  description: "Listar foros monitoreados",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
})
export default class ForumsListCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const guildId = await requireGuildId(ctx);
    if (!guildId) return;

    const { forumIds } = await configStore.get(
      guildId,
      ConfigurableModule.ForumAutoReply,
    );

    if (!forumIds.length) {
      await ctx.write({ content: "No hay foros monitoreados configurados." });
      return;
    }

    const lines = forumIds.map((id: string) => `• <#${id}>`).join("\n");

    const embed = new Embed({
      title: "Foros monitoreados",
      description: lines,
      color: EmbedColors.Blurple,
      footer: { text: `Total: ${forumIds.length}` },
    });

    await ctx.write({ embeds: [embed] });
  }
}
