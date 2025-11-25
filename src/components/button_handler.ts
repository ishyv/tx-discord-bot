/**
 * Motivación: encapsular el handler de componente "button handler" para enrutar customId al sistema de UI sin duplicar filtros ni wiring.
 *
 * Idea/concepto: extiende las primitivas de Seyfert para componentes y delega en el registro de UI la resolución del callback adecuado.
 *
 * Alcance: filtra y despacha interacciones de este tipo; no define la lógica interna de cada componente ni su contenido visual.
 */
import { id_exists, resolveAndInvoke } from "@/modules/ui";
import { ComponentCommand, type ComponentContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";

export default class UIButtonHandler extends ComponentCommand {
    componentType = "Button" as const;

    filter(ctx: ComponentContext<"Button">) {
        return id_exists(ctx.customId);
    }

    async run(ctx: ComponentContext<"Button">) {

        // Check if id has "defer" on it
        if (ctx.customId.includes("defer")) {
            await ctx.deferUpdate();
        }

        const ok = await resolveAndInvoke(ctx.customId, ctx);
        if (!ok) {
            await ctx.write({
                content: "Este botón ya no está activo.",
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
