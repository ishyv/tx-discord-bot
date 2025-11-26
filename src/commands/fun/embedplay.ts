/**
 * Motivación: registrar el comando "fun / embedplay" dentro de la categoría fun para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import { Command, Declare, type CommandContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { startEmbedDesigner } from "@/modules/prefabs/embedDesigner";

@Declare({
  name: "embedplay",
  description: "Probar el diseñador de embeds interactivo",
  contexts: ["Guild"],
})
export default class EmbedPlayCommand extends Command {
  async run(ctx: CommandContext) {
    await startEmbedDesigner(ctx, {
      userId: ctx.author.id,
      content: "Diseña un embed y lo devolveré como JSON.",
      onSubmit: async ({ embed }) => {

        console.log("[ EMBED DESIGNER ] Embed generado:", embed);

        await ctx.followup?.({
          content: "Embed generado:",
          embeds: [embed],
          components: [],
          flags: MessageFlags.Ephemeral,
        });

        const embed_json = embed.toJSON(); 

        await ctx.followup?.({
          content: "```json\n" + JSON.stringify(embed_json, null, 2) + "\n```",
          components: [],
          flags: MessageFlags.Ephemeral,
        });
      },
    });
  }
}
