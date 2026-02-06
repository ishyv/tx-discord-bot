/**
 * Motivación: encapsular la reacción al evento "invite Logs" para mantener la lógica en un módulo autocontenido.
 *
 * Idea/concepto: se suscribe a los hooks correspondientes y coordina servicios o sistemas que deben ejecutarse.
 *
 * Alcance: orquesta el flujo específico del listener; no define el hook ni registra el evento base.
 */
import { EmbedColors } from "seyfert/lib/common";

import { onInviteCreate } from "@/events/hooks/inviteEvents";
import { logModerationAction } from "@/utils/moderationLogger";

const toUnixSeconds = (
  value: number | string | Date | null | undefined,
): number | null => {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === "number") {
    return value > 10_000_000_000
      ? Math.floor(value / 1000)
      : Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
  }
  return null;
};

const formatDuration = (seconds: number | null | undefined): string => {
  if (!seconds || seconds <= 0) return "Ilimitada";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  const secs = seconds % 60;
  if (!parts.length && secs) parts.push(`${secs}s`);
  return parts.join(" ");
};

onInviteCreate(async (invite, client) => {
  const guildId = (invite as any)?.guildId ?? null;
  if (!guildId) return;

  const userId = (invite as any)?.inviter?.id ?? null;
  const channelId = (invite as any)?.channelId ?? null;
  const code = (invite as any)?.code ?? null;
  const maxAge =
    typeof (invite as any)?.maxAge === "number" ? (invite as any).maxAge : null;

  const createdSeconds =
    toUnixSeconds((invite as any)?.createdAt) ?? Math.floor(Date.now() / 1000);
  const expiresAt = maxAge && maxAge > 0 ? createdSeconds + maxAge : null;

  const lines = [
    `User: ${userId ? `<@${userId}>` : "Desconocido"}`,
    `Invitacion: ${code ? `https://discord.gg/${code}` : "desconocida"}`,
    `Channel: ${channelId ? `<#${channelId}>` : "desconocido"}`,
    `Duracion: ${formatDuration(maxAge)}`,
    `Creada: <t:${createdSeconds}:f>`,
  ];

  if (expiresAt) {
    lines.push(`Expires: <t:${expiresAt}:R>`);
  } else {
    lines.push("Expires: Nunca");
  }

  await logModerationAction(
    client,
    guildId,
    {
      title: "Nueva invitacion creada",
      description: lines.join("\n"),
      color: EmbedColors.Blurple,
    },
    "generalLogs",
  );
});

