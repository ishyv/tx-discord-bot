/**
 * Motivación: encapsular la generación de logs de moderación para mantener formato y destinos consistentes.
 *
 * Idea/concepto: construye embeds y mensajes estándar a partir de acciones disciplinarias y delega el envío a GuildLogger.
 *
 * Alcance: solo da forma a los logs de moderación; no decide sanciones ni gestiona permisos.
 */
import { Embed } from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import type { UsingClient } from "seyfert";

import { updateGuildPaths } from "@/db/repositories/guilds";
import { getGuildChannels } from "@/modules/guild-channels";
import { fetchStoredChannel, isUnknownChannelError } from "@/utils/channelGuard";

export interface ModerationLogPayload {
  title: string;
  description?: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  actorId?: string | null;
  color?: number;
  footer?: string;
}

export type ModerationLogChannel =
  | "generalLogs"
  | "messageLogs"
  | "pointsLog"
  | "voiceLogs";

/**
 * Centralized logger for moderation actions. Logs to console and, when
 * configured, to the guild's `generalLogs` channel.
 */
export async function logModerationAction(
  client: UsingClient,
  guildId: string,
  payload: ModerationLogPayload,
  channel: ModerationLogChannel = "generalLogs",
): Promise<void> {
  const { title, description, fields, actorId, color, footer } = payload;

  client.logger?.info?.("[moderation] action", {
    guildId,
    title,
    actorId,
  });

  try {
    const channels = await getGuildChannels(guildId);
    const core = channels.core as Record<string, { channelId: string } | null>;
    const logs = core?.[channel];
    const fetched = await fetchStoredChannel(client, logs?.channelId, () =>
      updateGuildPaths(guildId, {
        [`channels.core.${channel}`]: null,
      }),
    );
    if (!fetched.channel || !fetched.channelId) return;
    if (!fetched.channel.isTextGuild()) {
      return;
    }

    const embed = new Embed({
      title,
      description,
      color: color ?? EmbedColors.Blurple,
      fields,
      footer: footer ? { text: footer } : undefined,
    });

    await client.messages.write(fetched.channelId, {
      content: actorId ? `<@${actorId}>` : undefined,
      embeds: [embed],
      allowed_mentions: { parse: [] },
    });
  } catch (error) {
    if (isUnknownChannelError(error)) {
      await updateGuildPaths(guildId, {
        [`channels.core.${channel}`]: null,
      });
    }
    client.logger?.warn?.("[moderation] failed to log action to channel", {
      guildId,
      error,
    });
  }
}
