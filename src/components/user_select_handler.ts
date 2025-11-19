import { id_exists, resolveAndInvoke } from "@/modules/ui";
import { ComponentCommand, type ComponentContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";

export default class UIUserSelectHandler extends ComponentCommand {
    componentType = "UserSelect" as const;

    filter(ctx: ComponentContext<"UserSelect">) {
        return id_exists(ctx.customId);
    }

    async run(ctx: ComponentContext<"UserSelect">) {
        const ok = await resolveAndInvoke(ctx.customId, ctx);
        if (!ok) {
            await ctx.write({
                content: "Este menú de selección de usuarios ya no está activo.",
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
