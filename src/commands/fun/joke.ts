/**
 * Motivación: registrar el comando "fun / joke" dentro de la categoría fun para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import type { CommandContext } from "seyfert";
import { Command, Declare } from "seyfert";
import { generateForGuild } from "@/services/ai";
import { markAIMessage } from "@/services/ai/messageTracker";
import type { Message } from "@/utils/userMemory";
import { Modality } from "@google/genai";
import { Cooldown, CooldownType } from "@/modules/cooldown";

@Declare({
  name: "joke",
  description: "Generate a joke",
})
@Cooldown({
  type: CooldownType.User,
  interval: 30000, // 30 seconds - AI API cost protection
  uses: { default: 1 },
})
export default class JokeCommand extends Command {
  async run(ctx: CommandContext) {
    await ctx.deferReply();

    const messages: Message[] = [
      {
        role: "user",
        content:
          "Act as a professional comedian telling short jokes in English for a broad audience (teenagers and young adults). Write an original, very brief joke (1-2 lines), with a light, witty tone and an unexpected punchline that gets laughs. The joke should be universal, without references to specific categories (like programming, sports, or professions) or particular cultural contexts. Avoid childish, raunchy, offensive, or too absurd humor. Make it sound like a joke told in a comedy show for everyone, with a touch of wit that surprises!",
      },
    ];

    const response = await generateForGuild({
      guildId: ctx.guildId,
      userId: ctx.author.id,
      messages,
      overrides: {
        responseModalities: [Modality.TEXT],
        temperature: 0.9,
        topP: 0.95,
      },
    });

    await ctx.editOrReply({ content: markAIMessage(response.text) });
  }
}
