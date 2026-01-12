/**
 * Motivacion: permitir elegir el modelo de IA por guild.
 *
 * Idea/concepto: el listado de modelos depende del proveedor configurado.
 *
 * Alcance: valida y persiste el modelo en la configuracion por guild.
 */
import type { GuildCommandContext } from "seyfert";
import { Declare, Options, SubCommand, createStringOption, Middlewares } from "seyfert";

import { configStore, ConfigurableModule } from "@/configuration";
import {
  getDefaultModelForProvider,
  isModelAvailableForProvider,
  listModelsForProvider,
  isProviderAvailable,
} from "@/services/ai";
import { Guard } from "@/middlewares/guards/decorator";
import { respondModelAutocomplete } from "./shared";

const options = {
  model: createStringOption({
    description: "Modelo de IA",
    required: true,
    autocomplete: respondModelAutocomplete,
  }),
};

@Declare({
  name: "set-model",
  description: "Configurar el modelo de IA",
  defaultMemberPermissions: ["ManageGuild"],
  contexts: ["Guild"],
})
@Options(options)
@Guard({
  guildOnly: true,
})
@Middlewares(["guard"])
export default class AiSetModelCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;

    const model = ctx.options.model?.trim();
    if (!model) {
      await ctx.write({ content: "Debes indicar un modelo valido." });
      return;
    }

    const current = await configStore.get(guildId, ConfigurableModule.AI);
    const providerId = current.provider;

    if (!isProviderAvailable(providerId)) {
      await ctx.write({
        content: "El proveedor configurado no es valido. Usa /ai set-provider primero.",
      });
      return;
    }

    if (!isModelAvailableForProvider(providerId, model)) {
      const available = listModelsForProvider(providerId)
        .map((entry) => `\`${entry}\``)
        .join(", ");
      const fallback = getDefaultModelForProvider(providerId);
      await ctx.write({
        content: `Modelo no valido para \`${providerId}\`. Disponibles: ${available}. Por defecto: \`${fallback}\`.`,
      });
      return;
    }

    await configStore.set(guildId, ConfigurableModule.AI, { model });

    await ctx.write({
      content: `Modelo actualizado a \`${model}\` (provider: \`${providerId}\`).`,
    });
  }
}
