/**
 * Motivación: encapsular el handler de componente "mentionable select handler" para enrutar customId al sistema de UI sin duplicar filtros ni wiring.
 *
 * Idea/concepto: extiende las primitivas de Seyfert para componentes y delega en el registro de UI la resolución del callback adecuado.
 *
 * Alcance: filtra y despacha interacciones de este tipo; no define la lógica interna de cada componente ni su contenido visual.
 */
import { id_exists, resolveAndInvoke } from "@/modules/ui";
import { ComponentCommand, type ComponentContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";

export default class UIMentionableSelectHandler extends ComponentCommand {
  componentType = "MentionableSelect" as const;

  filter(ctx: ComponentContext<"MentionableSelect">) {
    return id_exists(ctx.customId);
  }

  async run(ctx: ComponentContext<"MentionableSelect">) {
    const ok = await resolveAndInvoke(ctx.customId, ctx);
    if (!ok) {
      await ctx.write({
        content: "This mention select menu is no longer active.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

