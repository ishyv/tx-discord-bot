/**
 * Motivacion: permitir elegir el proveedor de IA por guild.
 *
 * Idea/concepto: usa autocomplete para mostrar proveedores disponibles.
 *
 * Alcance: actualiza provider y modelo en la configuracion por guild.
 */
import type { GuildCommandContext } from "seyfert";
import {
  Declare,
  Options,
  SubCommand,
  createStringOption,
  Middlewares,
} from "seyfert";

import { configStore, ConfigurableModule } from "@/configuration";
import {
  getDefaultModelForProvider,
  isProviderAvailable,
  listProviders,
} from "@/services/ai";
import { Guard } from "@/middlewares/guards/decorator";
import { respondProviderAutocomplete } from "./shared";

const options = {
  provider: createStringOption({
    description: "Proveedor de IA",
    required: true,
    autocomplete: respondProviderAutocomplete,
  }),
};

@Declare({
  name: "set-provider",
  description: "Configurar el proveedor de IA",
  defaultMemberPermissions: ["ManageGuild"],
  contexts: ["Guild"],
})
@Options(options)
@Guard({
  guildOnly: true,
})
@Middlewares(["guard"])
export default class AiSetProviderCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;

    const providerId = ctx.options.provider?.trim();
    if (!providerId) {
      await ctx.write({ content: "Debes indicar un proveedor valido." });
      return;
    }

    if (!isProviderAvailable(providerId)) {
      const available = listProviders()
        .map((entry) => `\`${entry.id}\``)
        .join(", ");
      await ctx.write({
        content: `Proveedor no reconocido. Disponibles: ${available}`,
      });
      return;
    }

    const current = await configStore.get(guildId, ConfigurableModule.AI);
    if (current.provider === providerId) {
      await ctx.write({
        content: `El proveedor ya esta configurado en \`${providerId}\`.`,
      });
      return;
    }

    const defaultModel = getDefaultModelForProvider(providerId);
    await configStore.set(guildId, ConfigurableModule.AI, {
      provider: providerId,
      model: defaultModel,
    });

    await ctx.write({
      content: `Proveedor actualizado a \`${providerId}\`. Modelo por defecto: \`${defaultModel}\`.`,
    });
  }
}
