import { onMessageCreate } from "@/events/hooks/messageCreate";
import { AutoModSystem } from "@/systems/automod";
import { isFeatureEnabled } from "@/modules/features";

/**
 * Listener encargado de ejecutar AutoMod en cada mensaje de usuarios reales.
 */
onMessageCreate(async (message, client) => {
  if (message.author?.bot) {
    return;
  }

  const guildId = (message as any).guildId ?? message.member?.guildId;
  if (!guildId) return;

  const automodEnabled = await isFeatureEnabled(guildId, "automod");
  if (!automodEnabled) return;

  await AutoModSystem.getInstance(client).analyzeUserMessage(message);
});
