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

@Declare({
  name: "chiste",
  description: "Genera un chiste",
})
export default class JokeCommand extends Command {
  async run(ctx: CommandContext) {
    await ctx.deferReply();

    const messages: Message[] = [
      {
        role: "user",
        content:
          "Actúa como un comediante profesional que cuenta chistes cortos en español para un público amplio (adolescentes y adultos jóvenes). Escribe un chiste original, muy breve (1-2 líneas), con un tono ligero, ingenioso y un remate inesperado que saque risas. El chiste debe ser universal, sin referencias a categorías específicas (como programación, deportes o profesiones) ni contextos culturales particulares. Evita humor infantil, subido de tono, ofensivo o demasiado absurdo. ¡Haz que suene como un chiste contado en un show de comedia para todos, con un toque de ingenio que sorprenda!",
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
