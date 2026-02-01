/**
 * AI Set Model Command.
 *
 * Purpose: Allow selecting an AI model per guild based on the configured provider.
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
  isModelAvailableForProvider,
  listModelsForProvider,
  isProviderAvailable,
} from "@/services/ai";
import { Guard } from "@/middlewares/guards/decorator";
import { respondModelAutocomplete } from "./shared";

const options = {
  model: createStringOption({
    description: "AI model",
    required: true,
    autocomplete: respondModelAutocomplete,
  }),
};

@Declare({
  name: "set-model",
  description: "Configure the AI model",
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
      await ctx.write({ content: "You must specify a valid model." });
      return;
    }

    const current = await configStore.get(guildId, ConfigurableModule.AI);
    const providerId = current.provider;

    if (!isProviderAvailable(providerId)) {
      await ctx.write({
        content:
          "The configured provider is not valid. Use /ai set-provider first.",
      });
      return;
    }

    if (!isModelAvailableForProvider(providerId, model)) {
      const available = listModelsForProvider(providerId)
        .map((entry) => `\`${entry}\``)
        .join(", ");
      const fallback = getDefaultModelForProvider(providerId);
      await ctx.write({
        content: `Invalid model for \`${providerId}\`. Available: ${available}. Default: \`${fallback}\`.`,
      });
      return;
    }

    await configStore.set(guildId, ConfigurableModule.AI, { model });

    await ctx.write({
      content: `Model updated to \`${model}\` (provider: \`${providerId}\`).`,
    });
  }
}
