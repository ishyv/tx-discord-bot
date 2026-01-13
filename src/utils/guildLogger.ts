/**
 * Propósito: ofrecer una API única para enviar logs de servidor sin duplicar
 * lógica de resolución de canales o armado de embeds.
 * Encaje: capa de orquestación sobre los stores/config de guild; los features
 * (moderación, tickets, puntos) llaman a métodos de alto nivel.
 * Dependencias clave: `guild-channels` (fuentes primarias), `CHANNELS_ID`
 * (fallbacks) y `updateGuildPaths` para sanear referencias rotas.
 * Invariantes: si existe `guildId`, siempre se intenta usar canales core antes
 * de caer al fallback; los embeds siempre llevan `timestamp` y color por
 * defecto `Blurple`.
 * Gotchas: si la API devuelve error de canal desconocido, se limpia la ruta
 * configurada; esto puede ocultar problemas de permisos si no se monitorea.
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

/**
 * Logger desacoplado de features; resuelve canales y arma embeds seguros.
 *
 * Invariantes:
 * - `init` debe llamarse antes de usar; almacena `client` y `guildId`.
 * - Las resoluciones de canal preferirán core->managed->fallback constantes.
 * - Si un canal core desaparece, se limpia en DB para evitar retrys infinitos.
 * RISK: en ausencia de `guildId`, usa los ids por defecto globales; validar que
 * existan para el entorno (dev/stg/prod).
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
   * Resuelve el canal objetivo siguiendo prioridad core -> fallback.
   *
   * WHY: preferimos canales configurados por guild; si están corruptos se
   * limpian para no repetir errores en cada log.
   * RISK: si `CHANNELS_ID` no tiene fallback para la clave, los logs se pierden
   * silenciosamente (`source: none`). Monitorear warnings para claves faltantes.
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
   * Envía un log al canal resuelto.
   *
   * Propósito: punto único de envío para aplicar fallback y saneamiento.
   * RISK: si el canal core falla, se limpia en DB para evitar retrys; si el
   * error era temporal de permisos, se pierde la referencia hasta reconfigurar.
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
}
