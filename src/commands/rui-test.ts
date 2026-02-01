/**
 * Motivación: registrar el comando "ping" dentro de la categoría ping para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import type { CommandContext } from "seyfert";
import { Command, Declare } from "seyfert";

import { ActionRow, Embed } from "seyfert";
import { Button, UI } from "@/modules/ui";
import { ButtonStyle } from "seyfert/lib/types";

@Declare({
  name: "rui-test",
  description: "test de interfaz de usuario reactiva",
})
export default class RuiTestCommand extends Command {
  async run(ctx: CommandContext) {
    await new UI<{ count: number }>(
      { count: 0 },
      (state) => {
        const embed = new Embed().setDescription(`Clicks: ${state.count}`);

        const increment = new Button()
          .setLabel("+1")
          .setStyle(ButtonStyle.Primary)
          .onClick("increment", () => {
            state.count += 1;
          });

        return {
          embeds: [embed],
          components: [new ActionRow().addComponents(increment)],
        };
      },
      (msg) => ctx.editOrReply(msg),
    ).send();
  }
}
