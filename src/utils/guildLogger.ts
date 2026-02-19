/**
 * Purpose: Provide a single API for sending server logs without duplicating
 * channel resolution or embed building logic.
 * Context: Orchestration layer over guild stores/config; features
 * (moderation, tickets, points) call high-level methods.
 * Key Dependencies: `guild-channels` (primary sources), `CHANNELS_ID`
 * (fallbacks), and `updateGuildPaths` to clean up broken references.
 * Invariants: If `guildId` exists, core channels are always attempted before
 * falling back; embeds always include a `timestamp` and default `Blurple` color.
 * Gotchas: If the API returns an unknown channel error, the configured path
 * is cleared; this may hide permission issues if not monitored.
 */
import { Embed, type UsingClient } from "seyfert";
import type { ColorResolvable } from "seyfert/lib/common";
import type { APIEmbedField } from "seyfert/lib/types";
import { CHANNELS_ID } from "@/constants/guild";
import { updateGuildPaths } from "@/db/repositories/guilds";
import { getGuildChannels } from "@/modules/guild-channels";
import {
  fetchStoredChannel,
  isUnknownChannelError,
} from "@/utils/channelGuard";

export type EmbedOptions = {
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

/**
 * Logger decoupled from features; resolves channels and builds safe embeds.
 *
 * Invariants:
 * - `init` must be called before use; it stores `client` and `guildId`.
 * - Channel resolutions prefer core -> managed -> constant fallback.
 * - If a core channel disappears, it is cleared in the DB to avoid infinite retries.
 * RISK: In the absence of `guildId`, it uses global default IDs; validate that
 * they exist for the environment (dev/stg/prod).
 */
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

  /**
   * Resolves the target channel following core -> fallback priority.
   *
   * WHY: We prefer channels configured per guild; if they are corrupt, they
   * are cleared to avoid repeating errors in every log.
   * RISK: If `CHANNELS_ID` does not have a fallback for the key, logs are lost
   * silently (`source: none`). Monitor warnings for missing keys.
   */
  private async resolveChannel(
    key: keyof typeof CHANNELS_ID,
  ): Promise<ResolvedChannel> {
    if (!this.guildId) {
      return { channelId: CHANNELS_ID[key] ?? null, source: "fallback" };
    }

    try {
      const channels = await getGuildChannels(this.guildId);

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

  /**
   * Sends a log to the resolved channel.
   *
   * Purpose: Single point of sending to apply fallback and cleanup.
   * RISK: If the core channel fails, it is cleared in the DB to avoid retries; if 
   * the error was temporary permission-related, the reference is lost until reconfigured.
   */
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
      if (
        resolved.source === "core" &&
        this.guildId &&
        isUnknownChannelError(error)
      ) {
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

  /**
   * Unified moderation log. Targets `banSanctions` by default.
   * Accepts an optional `actorId` to display the moderator in the footer,
   * and an optional `channel` override for non-sanction logs (e.g. `generalLogs`, `pointsLog`).
   *
   * Contract: **never throws**. All errors are swallowed and logged.
   */
  async moderationLog(
    options: EmbedOptions & { actorId?: string | null },
    channel: keyof typeof CHANNELS_ID = "banSanctions",
  ): Promise<void> {
    try {
      return await this.sendLog(channel, options);
    } catch (error) {
      this.client?.logger?.warn?.("[GuildLogger] moderationLog failed", {
        error,
        guildId: this.guildId,
        channel: String(channel),
      });
    }
  }
}
