/**
 * Exposes the interactive embed designer for quick testing.
 * Responsibility: launch the designer and echo the resulting embed and JSON back to the user.
 */
import { Command, Declare, type CommandContext, type Embed } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { startEmbedDesigner } from "@/modules/prefabs/embedDesigner";

const EPHEMERAL = MessageFlags.Ephemeral;

@Declare({
  name: "embedplay",
  description: "Probar el disenador de embeds interactivo",
  contexts: ["Guild"],
})
export default class EmbedPlayCommand extends Command {
  async run(ctx: CommandContext) {
    const sendFollowup = async (
      content: string,
      embeds: Embed[] = [],
    ): Promise<void> => {
      if (!ctx.followup) return;
      await ctx.followup({
        content,
        embeds,
        components: [],
        flags: EPHEMERAL,
      });
    };

    await startEmbedDesigner(ctx, {
      userId: ctx.author.id,
      content: "Disena un embed y se devolvera como JSON.",
      onSubmit: async ({ embed }) => {
        console.log("[embedplay] Embed generado:", embed);

        await sendFollowup("Embed generado:", [embed]);

        const embedJson = embed.toJSON();
        await sendFollowup(
          `\`\`\`json\n${JSON.stringify(embedJson, null, 2)}\n\`\`\``,
        );
      },
    });
  }
}
