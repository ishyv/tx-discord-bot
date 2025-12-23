import type { AutocompleteInteraction } from "seyfert";

import { configStore, ConfigurableModule } from "@/configuration";
import {
  getDefaultProviderId,
  listModelsForProvider,
  listProviders,
} from "@/services/ai";

export async function respondProviderAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const input = interaction.getInput()?.toLowerCase() ?? "";
  const providers = listProviders();
  const filtered = input
    ? providers.filter(
        (provider) =>
          provider.id.includes(input) ||
          provider.label.toLowerCase().includes(input),
      )
    : providers;

  await interaction.respond(
    filtered.slice(0, 20).map((provider) => ({
      name: provider.label,
      value: provider.id,
    })),
  );
}

export async function respondModelAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const guildId = interaction.guildId;
  const input = interaction.getInput()?.toLowerCase() ?? "";

  let providerId = getDefaultProviderId();
  if (guildId) {
    try {
      const config = await configStore.get(guildId, ConfigurableModule.AI);
      if (config.provider) {
        providerId = config.provider;
      }
    } catch {
      // ignore and fallback to default provider
    }
  }

  const models = listModelsForProvider(providerId);
  const filtered = input
    ? models.filter((model) => model.toLowerCase().includes(input))
    : models;

  await interaction.respond(
    filtered.slice(0, 20).map((model) => ({
      name: model,
      value: model,
    })),
  );
}
