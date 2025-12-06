/**
 * Motivación: encapsular la reacción al evento "reputation Detection" para mantener la lógica en un módulo autocontenido.
 *
 * Idea/concepto: se suscribe a los hooks correspondientes y coordina servicios o sistemas que deben ejecutarse.
 *
 * Alcance: orquesta el flujo específico del listener; no define el hook ni registra el evento base.
 */
import { onMessageCreate } from "@/events/hooks/messageCreate";

import { getGuildChannels } from "@/modules/guild-channels";
import { sendReputationRequest } from "@/commands/moderation/rep/shared";
import { isFeatureEnabled, Features } from "@/modules/features";

onMessageCreate(async (message, client) => {
    if (message.author.bot) return;
    if (!message.guildId) return;

    const detectionEnabled = await isFeatureEnabled(
        message.guildId,
        Features.ReputationDetection,
    );
    if (!detectionEnabled) return;

    const { configStore, ConfigurableModule } = await import("@/configuration");
    const { keywords } = await configStore.get(message.guildId, ConfigurableModule.Reputation);

    if (!keywords || keywords.length === 0) {
        return;
    }

    const content = message.content.toLowerCase();
    const hasKeyword = keywords.some((keyword: string) => content.includes(keyword.toLowerCase()));

    if (hasKeyword) {
        const guildChannels = await getGuildChannels(message.guildId);
        const repChannelId = guildChannels?.core?.repRequests?.channelId;

        if (!repChannelId) return;

        const repChannel = await client.channels.fetch(repChannelId);
        if (!repChannel || !repChannel.isTextGuild()) return;

        await sendReputationRequest(repChannel, message, message.author, true);
    }
});
