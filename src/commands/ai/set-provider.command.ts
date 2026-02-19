/**
 * AI Set Provider Command.
 *
 * Purpose: Allow selecting an AI provider per guild using autocomplete.
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
import { HelpDoc, HelpCategory } from "@/modules/help";
import {
  getDefaultModelForProvider,
  isProviderAvailable,
  listProviders,
} from "@/services/ai";
import { Guard } from "@/middlewares/guards/decorator";
import { respondProviderAutocomplete } from "./shared";

const options = {
  provider: createStringOption({
    description: "AI provider",
    required: true,
    autocomplete: respondProviderAutocomplete,
  }),
};

@HelpDoc({
  command: "ai set-provider",
  category: HelpCategory.AI,
  description: "Set the AI provider used for this server's AI features",
  usage: "/ai set-provider <provider>",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "set-provider",
  description: "Configure the AI provider",
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
      await ctx.write({ content: "You must specify a valid provider." });
      return;
    }

    if (!isProviderAvailable(providerId)) {
      const available = listProviders()
        .map((entry) => `\`${entry.id}\``)
        .join(", ");
      await ctx.write({
        content: `Provider not recognized. Available: ${available}`,
      });
      return;
    }

    const current = await configStore.get(guildId, ConfigurableModule.AI);
    if (current.provider === providerId) {
      await ctx.write({
        content: `Provider is already set to \`${providerId}\`.`,
      });
      return;
    }

    const defaultModel = getDefaultModelForProvider(providerId);
    await configStore.set(guildId, ConfigurableModule.AI, {
      provider: providerId,
      model: defaultModel,
    });

    await ctx.write({
      content: `Provider updated to \`${providerId}\`. Default model: \`${defaultModel}\`.`,
    });
  }
}
