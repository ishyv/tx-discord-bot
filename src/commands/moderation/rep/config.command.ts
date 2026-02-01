import {
  createBooleanOption,
  createStringOption,
  Declare,
  GuildCommandContext,
  Options,
  SubCommand,
  Middlewares,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { setFeatureFlag } from "@/modules/features";
import { Guard } from "@/middlewares/guards/decorator";
import { Features } from "@/modules/features";

const options = {
  palabras: createStringOption({
    description: "Lista de palabras separadas por comas",
    required: true,
  }),
};

@Declare({
  name: "keywords",
  description: "Configurar palabras clave de reputacion",
})
@Options(options)
@Guard({
  guildOnly: true,
  feature: Features.Reputation,
  permissions: ["ManageGuild"],
})
@Middlewares(["guard"])
export default class RepConfigKeywordsCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;

    const { palabras } = ctx.options;
    const keywords = palabras
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean);

    const { configStore, ConfigurableModule } = await import("@/configuration");
    await configStore.set(guildId, ConfigurableModule.Reputation, { keywords });

    await ctx.write({
      content: `Se han actualizado las palabras clave de reputacion: ${keywords.map((k) => `\`${k}\``).join(", ")}`,
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
  description: "Configurar deteccion automatica de reputacion",
})
@Options(detectionOptions)
@Guard({
  guildOnly: true,
  feature: Features.Reputation,
  permissions: ["ManageGuild"],
})
@Middlewares(["guard"])
export class RepConfigDetectionCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof detectionOptions>) {
    const guildId = ctx.guildId;

    const { enabled } = ctx.options;
    await setFeatureFlag(guildId, Features.ReputationDetection, enabled);

    await ctx.write({
      content: `La deteccion automatica de reputacion ha sido **${enabled ? "habilitada" : "deshabilitada"}**.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
