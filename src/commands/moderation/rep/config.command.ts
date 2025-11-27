import {
    createStringOption,
    Declare,
    GuildCommandContext,
    Options,
    SubCommand,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { requireRepContext } from "./shared";
import { updateGuild } from "@/db/repositories";
import { createBooleanOption } from "seyfert";
import { setFeatureFlag, Features } from "@/modules/features";

const options = {
    palabras: createStringOption({
        description: "Lista de palabras clave separadas por coma",
        required: true,
    }),
};

@Declare({
    name: "keywords",
    description: "Configurar palabras clave para deteccion automatica de reputacion",
    defaultMemberPermissions: ["ManageGuild"]
})
@Options(options)
export default class RepConfigKeywordsCommand extends SubCommand {
    async run(ctx: GuildCommandContext<typeof options>) {
        const context = await requireRepContext(ctx);
        if (!context) return;

        const { palabras } = ctx.options;
        const keywords = palabras.split(",").map((w) => w.trim()).filter(Boolean);

        await updateGuild(context.guildId, {
            reputation: {
                keywords,
            },
        });

        await ctx.write({
            content: `Se han actualizado las palabras clave de reputacion: ${keywords.map(k => `\`${k}\``).join(", ")}`,
            flags: MessageFlags.Ephemeral,
        });
    }
}



const detectionOptions = {
    enabled: createBooleanOption({
        description: "Habilitar o deshabilitar la deteccion automatica",
        required: true,
    }),
};

@Declare({
    name: "detection",
    description: "Habilitar o deshabilitar la deteccion automatica de reputacion",
})
@Options(detectionOptions)
export class RepConfigDetectionCommand extends SubCommand {
    async run(ctx: GuildCommandContext<typeof detectionOptions>) {
        const context = await requireRepContext(ctx);
        if (!context) return;

        const { enabled } = ctx.options;
        await setFeatureFlag(context.guildId, Features.ReputationDetection, enabled);

        await ctx.write({
            content: `La deteccion automatica de reputacion ha sido **${enabled ? "habilitada" : "deshabilitada"}**.`,
            flags: MessageFlags.Ephemeral,
        });
    }
}
