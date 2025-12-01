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
import { getGuildChannels } from "@/modules/guild-channels";

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

  private async resolveChannel(key: keyof typeof CHANNELS_ID): Promise<string | null> {
    if (!this.guildId) return CHANNELS_ID[key] ?? null;

    try {
      const channels = await getGuildChannels(this.guildId);
      // Try to find in core channels, then managed, then fallback to constant
      // Note: mapping keys from CHANNELS_ID to schema keys might be needed if they differ.
      // Assuming keys match for now or using specific logic.

      // The schema has specific keys like 'messageLogs', 'voiceLogs', etc.
      // CHANNELS_ID has 'messageLogs', 'voiceLogs', etc.

      // @ts-ignore -- dynamic access
      const core = channels.core?.[key]?.channelId;
      if (core) return core;

      return CHANNELS_ID[key] ?? null;
    } catch (error) {
      console.warn(`[GuildLogger] Failed to resolve channel for ${key}`, error);
      return CHANNELS_ID[key] ?? null;
    }
  }

  private async sendLog(
    key: keyof typeof CHANNELS_ID,
    options: EmbedOptions,
  ): Promise<void> {
    const channelId = await this.resolveChannel(key);
    if (!channelId) return;

    const embed = this.buildEmbed(options);
    await this.client.messages.write(channelId, { embeds: [embed] });
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
