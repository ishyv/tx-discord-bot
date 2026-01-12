/**
 * Motivación: centralizar el logging de acciones en servidores para evitar repetición de configuración de canales y embeds.
 *
 * Idea/concepto: inicializa canales de log y expone métodos de alto nivel para distintos tipos de eventos (moderación, voz, invitaciones).
 *
 * Alcance: capa de orquestación de logs; no define reglas de negocio ni decide qué eventos se generan.
 */
import { Embed, type UsingClient } from "seyfert";
import type { ColorResolvable } from "seyfert/lib/common";
import type { APIEmbedField } from "seyfert/lib/types";
import { CHANNELS_ID } from "@/constants/guild";
import { updateGuildPaths } from "@/db/repositories/guilds";
import { getGuildChannels } from "@/modules/guild-channels";
import { fetchStoredChannel, isUnknownChannelError } from "@/utils/channelGuard";

type EmbedOptions = {
  title?: string;
  description?: string;
  color?: ColorResolvable;
  fields?: APIEmbedField[];
  footer?: { text: string; iconUrl?: string };
  thumbnail?: string;
  image?: string;
  url?: string;
};

type ResolvedChannel = {
  channelId: string | null;
  source: "core" | "fallback" | "none";
};

export class GuildLogger {
  private client!: UsingClient;
  private guildId?: string;

  async init(client: UsingClient, guildId?: string) {
    this.client = client;
    this.guildId = guildId;
    return this;
  }

  private buildEmbed(options: EmbedOptions): Embed {
    const embed = new Embed()
      .setTimestamp()
      .setColor(options.color ?? "Blurple");

    if (options.title) embed.setTitle(options.title);
    if (options.description) embed.setDescription(options.description);
    if (options.fields) embed.setFields(options.fields);
    if (options.footer) embed.setFooter(options.footer);
    if (options.thumbnail) embed.setThumbnail(options.thumbnail);
    if (options.image) embed.setImage(options.image);
    if (options.url) embed.setURL(options.url);

    return embed;
  }

  private async resolveChannel(
    key: keyof typeof CHANNELS_ID,
  ): Promise<ResolvedChannel> {
    if (!this.guildId) {
      return { channelId: CHANNELS_ID[key] ?? null, source: "fallback" };
    }

    try {
      const channels = await getGuildChannels(this.guildId);
      // Try to find in core channels, then managed, then fallback to constant
      // Note: mapping keys from CHANNELS_ID to schema keys might be needed if they differ.
      // Assuming keys match for now or using specific logic.

      // The schema has specific keys like 'messageLogs', 'voiceLogs', etc.
      // CHANNELS_ID has 'messageLogs', 'voiceLogs', etc.

      const core = channels.core as
        | Record<string, { channelId?: string } | null | undefined>
        | undefined;
      const coreChannelId = core?.[key]?.channelId ?? null;
      if (coreChannelId) {
        const fetched = await fetchStoredChannel(
          this.client,
          coreChannelId,
          () =>
            updateGuildPaths(this.guildId!, {
              [`channels.core.${key}`]: null,
            }),
        );

        if (fetched.channel && fetched.channelId) {
          if (!fetched.channel.isTextGuild()) {
            return { channelId: null, source: "none" };
          }
          return { channelId: fetched.channelId, source: "core" };
        }

        if (fetched.missing) {
          return { channelId: CHANNELS_ID[key] ?? null, source: "fallback" };
        }

        return { channelId: null, source: "none" };
      }

      return { channelId: CHANNELS_ID[key] ?? null, source: "fallback" };
    } catch (error) {
      console.warn(`[GuildLogger] Failed to resolve channel for ${key}`, error);
      return { channelId: CHANNELS_ID[key] ?? null, source: "fallback" };
    }
  }

  private async sendLog(
    key: keyof typeof CHANNELS_ID,
    options: EmbedOptions,
  ): Promise<void> {
    const resolved = await this.resolveChannel(key);
    if (!resolved.channelId) return;

    const embed = this.buildEmbed(options);
    try {
      await this.client.messages.write(resolved.channelId, { embeds: [embed] });
    } catch (error) {
      if (resolved.source === "core" && this.guildId && isUnknownChannelError(error)) {
        await updateGuildPaths(this.guildId, {
          [`channels.core.${key}`]: null,
        });
      }
      this.client.logger?.warn?.("[GuildLogger] Failed to send log", {
        error,
        guildId: this.guildId,
        channel: String(key),
        channelId: resolved.channelId,
      });
    }
  }

  async messageLog(options: EmbedOptions) {
    return this.sendLog("messageLogs", options);
  }

  async voiceLog(options: EmbedOptions) {
    return this.sendLog("voiceLogs", options);
  }

  async ticketLog(options: EmbedOptions) {
    return this.sendLog("ticketLogs", options);
  }

  async pointLog(options: EmbedOptions) {
    return this.sendLog("pointsLog", options);
  }

  async generalLog(options: EmbedOptions) {
    return this.sendLog("generalLogs", options);
  }

  async banSanctionLog(options: EmbedOptions) {
    return this.sendLog("banSanctions", options);
  }
}
