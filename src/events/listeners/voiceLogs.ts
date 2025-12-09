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
  // Seyfert typings may omit server mute/deaf flags; fall back to duck-typing.
  const serverMute = Boolean((state as any)?.serverMute);
  const serverDeaf = Boolean((state as any)?.serverDeaf);
  const prevServerMute = Boolean((oldState as any)?.serverMute);
  const prevServerDeaf = Boolean((oldState as any)?.serverDeaf);

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

  if (serverMute !== prevServerMute) {
    await logModerationAction(client, guildId, {
      title: serverMute ? "Usuario muteado en voz" : "Mute de voz removido",
      description: [
        `Usuario: ${formatUser(userId)}`,
        newChannelId ? `Canal: <#${newChannelId}>` : oldChannelId ? `Canal: <#${oldChannelId}>` : "Canal desconocido",
        `Hora: <t:${now()}:f>`,
      ].join("\n"),
      color: serverMute ? EmbedColors.Red : EmbedColors.Green,
    });
  }

  if (serverDeaf !== prevServerDeaf) {
    await logModerationAction(client, guildId, {
      title: serverDeaf ? "Usuario ensordecido en voz" : "Ensordecimiento removido",
      description: [
        `Usuario: ${formatUser(userId)}`,
        newChannelId ? `Canal: <#${newChannelId}>` : oldChannelId ? `Canal: <#${oldChannelId}>` : "Canal desconocido",
        `Hora: <t:${now()}:f>`,
      ].join("\n"),
      color: serverDeaf ? EmbedColors.Red : EmbedColors.Green,
    });
  }
});

onChannelCreate(async (channel, client) => {

  // Solo canales de voz
  if (!(channel.type === ChannelType.GuildVoice)) return;
  if (!channel.isVoice()) return;

  const channelId = channel?.id;
  const channelName = channel?.name ?? channelId ?? "Canal de voz";

  await logModerationAction(
    client,
    channel.guildId,
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
