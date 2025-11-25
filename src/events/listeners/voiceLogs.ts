/**
 * Motivación: encapsular la reacción al evento "voice Logs" para mantener la lógica en un módulo autocontenido.
 *
 * Idea/concepto: se suscribe a los hooks correspondientes y coordina servicios o sistemas que deben ejecutarse.
 *
 * Alcance: orquesta el flujo específico del listener; no define el hook ni registra el evento base.
 */
import { EmbedColors } from "seyfert/lib/common";
import { ChannelType } from "seyfert/lib/types";

import { onChannelCreate } from "@/events/hooks/channelEvents";
import { onVoiceStateUpdate } from "@/events/hooks/voiceState";
import { logModerationAction } from "@/utils/moderationLogger";

const now = (): number => Math.floor(Date.now() / 1000);

const formatUser = (userId: string | null | undefined): string =>
  userId ? `<@${userId}>` : "Usuario desconocido";

onVoiceStateUpdate(async (payload, client) => {
  const [state, oldState] = Array.isArray(payload) ? payload : [];
  const guildId = state?.guildId ?? oldState?.guildId;
  if (!guildId) return;

  const userId = state?.userId ?? oldState?.userId ?? null;
  const newChannelId = state?.channelId ?? null;
  const oldChannelId = oldState?.channelId ?? null;

  if (oldChannelId && oldChannelId !== newChannelId) {
    await logModerationAction(
      client,
      guildId,
      {
        title: "Salida de canal de voz",
        description: [
          `Usuario: ${formatUser(userId)}`,
          `Canal: <#${oldChannelId}>`,
          `Hora: <t:${now()}:f>`,
        ].join("\n"),
        color: EmbedColors.Red,
      },
      "voiceLogs",
    );
  }

  if (newChannelId && newChannelId !== oldChannelId) {
    await logModerationAction(
      client,
      guildId,
      {
        title: "Ingreso a canal de voz",
        description: [
          `Usuario: ${formatUser(userId)}`,
          `Canal: <#${newChannelId}>`,
          `Hora: <t:${now()}:f>`,
        ].join("\n"),
        color: EmbedColors.Green,
      },
      "voiceLogs",
    );
  }
});

onChannelCreate(async (channel, client) => {
  const guildId = channel?.guildId;
  if (!guildId) return;

  const type = channel?.type;
  const isVoiceChannel =
    type === ChannelType.GuildVoice || type === ChannelType.GuildStageVoice;
  if (!isVoiceChannel) return;

  const channelId = channel?.id;
  const channelName = channel?.name ?? channelId ?? "Canal de voz";

  await logModerationAction(
    client,
    guildId,
    {
      title: "Canal de voz creado",
      description: [
        `Canal: ${channelId ? `<#${channelId}>` : channelName} (${channelName})`,
        `Hora: <t:${now()}:f>`,
      ].join("\n"),
      color: EmbedColors.Blurple,
    },
    "voiceLogs",
  );
});
