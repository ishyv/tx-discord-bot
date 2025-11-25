/**
 * Motivación: registrar el comando "ping" dentro de la categoría ping para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import type { CommandContext } from "seyfert";
import { Command, Declare } from "seyfert";

@Declare({
  name: "ping",
  description: "Mostrar la latencia con Discord",
})
export default class PingCommand extends Command {
  async run(ctx: CommandContext) {
    const ping = ctx.client.gateway.latency;

    await ctx.write({
      content: `La latencia es \`${ping}ms\``,
    });
  }
}
