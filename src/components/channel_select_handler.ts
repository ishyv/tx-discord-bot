/**
 * Motivación: encapsular el handler de componente "channel select handler" para enrutar customId al sistema de UI sin duplicar filtros ni wiring.
 *
 * Idea/concepto: extiende las primitivas de Seyfert para componentes y delega en el registro de UI la resolución del callback adecuado.
 *
 * Alcance: filtra y despacha interacciones de este tipo; no define la lógica interna de cada componente ni su contenido visual.
 */
import { id_exists, resolveAndInvoke } from "@/modules/ui";
import { ComponentCommand, type ComponentContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";

export default class UIChannelSelectHandler extends ComponentCommand {
    componentType = "ChannelSelect" as const;

    filter(ctx: ComponentContext<"ChannelSelect">) {
        return id_exists(ctx.customId);
    }

    async run(ctx: ComponentContext<"ChannelSelect">) {
        const ok = await resolveAndInvoke(ctx.customId, ctx);
        if (!ok) {
            await ctx.write({
                content: "Este menú de selección de canales ya no está activo.",
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
