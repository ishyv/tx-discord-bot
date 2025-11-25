/**
 * Motivación: encapsular el handler de componente "string select handler" para enrutar customId al sistema de UI sin duplicar filtros ni wiring.
 *
 * Idea/concepto: extiende las primitivas de Seyfert para componentes y delega en el registro de UI la resolución del callback adecuado.
 *
 * Alcance: filtra y despacha interacciones de este tipo; no define la lógica interna de cada componente ni su contenido visual.
 */
import { id_exists, resolveAndInvoke } from "@/modules/ui";
import { ComponentCommand, type ComponentContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";

export default class UIStringSelectHandler extends ComponentCommand {
    componentType = "StringSelect" as const;

    filter(ctx: ComponentContext<"StringSelect">) {
        return id_exists(ctx.customId);
    }

    async run(ctx: ComponentContext<"StringSelect">) {
        // await ctx.deferUpdate();
        const ok = await resolveAndInvoke(ctx.customId, ctx);
        if (!ok) {
            await ctx.write({
                content: "Este menú de selección ya no está activo.",
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
