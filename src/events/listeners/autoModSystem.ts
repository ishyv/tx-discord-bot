/**
 * Motivación: encapsular la reacción al evento "auto Mod System" para mantener la lógica en un módulo autocontenido.
 *
 * Idea/concepto: se suscribe a los hooks correspondientes y coordina servicios o sistemas que deben ejecutarse.
 *
 * Alcance: orquesta el flujo específico del listener; no define el hook ni registra el evento base.
 */
import { onMessageCreate } from "@/events/hooks/messageCreate";
import { AutoModSystem } from "@/systems/automod";
import { isFeatureEnabled, Features } from "@/modules/features";

/**
 * Listener encargado de ejecutar AutoMod en cada mensaje de usuarios reales.
 */
onMessageCreate(async (message, client) => {
  if (message.author?.bot) {
    return;
  }

  const guildId = (message as any).guildId ?? message.member?.guildId;
  if (!guildId) return;

  const automodEnabled = await isFeatureEnabled(guildId, Features.Automod);
  if (!automodEnabled) return;

  await AutoModSystem.getInstance(client).analyzeUserMessage(message);
});
