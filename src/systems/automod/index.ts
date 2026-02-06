/**
 * AutoMod System: Detection of malicious content in messages and attachments.
 *
 * Purpose: Orchestrate the complete automatic moderation pipeline for a guild,
 * coordinating link spam detection, text filters, and image analysis with OCR.
 *
 * System Context: Main orchestration layer that consumes:
 *   - Spam/link filters (`constants/automod`)
 *   - OCR service (`services/ocr`)
 *   - Persistent cache (`utils/cache`)
 *   - Moderation logging (`utils/moderationLogger`)
 *
 * Key Invariants:
 *   - Singleton per client instance (shares cache and OCR worker)
 *   - Ordered pipeline: links → text → images (stops at the first match)
 *   - Only images with contentType "image/*" are processed
 *   - "unsafe" results are cached for 7 days to avoid reprocessing
 *
 * Tradeoffs and Decisions:
 *   - Staff-only moderation: Notifies but does not act automatically to avoid false positives
 *   - Fixed OCR preprocessing: Threshold(150) is fast but fragile to lighting conditions
 *   - Long cache duration: 7 days reduces load but carries false positives
 *
 * Known Risks:
 *   - OCR can fail on images with variable lighting or handwritten text
 *   - Long cache can propagate false positives for a week
 *   - No retries: OCR failures are marked as "not detected" permanently
 *
 * Gotchas:
 *   - The system is called "scan detection" but only detects scam text, it does not classify image types
 *   - Images are downloaded entirely into memory (8MB limit)
 *   - The OCR service can become permanently "unavailable" if initialization fails
 */
import type { Message, UsingClient } from "seyfert";
import { scamFilterList, spamFilterList } from "@/constants/automod";
import { updateGuildPaths } from "@/db/repositories/guilds";
import type { CoreChannelRecord } from "@/db/schemas/guild";
import { getGuildChannels } from "@/modules/guild-channels";
import { recognizeText } from "@/services/ocr";
import { Cache } from "@/utils/cache";
import {
  fetchStoredChannel,
  isUnknownChannelError,
} from "@/utils/channelGuard";
import { phash } from "@/utils/phash";
import { configStore, ConfigurableModule } from "@/configuration";
import { logModerationAction } from "@/utils/moderationLogger";
import { isSnowflake } from "@/utils/snowflake";

type AttachmentLike = {
  contentType?: string | null;

  url: string;
};
const FIVE_MINUTES = 5 * 60 * 1000;
const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
const ATTACHMENT_FETCH_TIMEOUT_MS = 15_000;
const MAX_AUTOMOD_IMAGE_BYTES = 8 * 1024 * 1024;
/**
 * Server AutoMod core: quickly checks text and then analyzes attachments as needed.
 */
export class AutoModSystem {
  private client: UsingClient;
  private static instance: AutoModSystem | null = null;
  private linkSpamState = new Map<string, Map<string, number[]>>();
  private linkSpamCooldown = new Map<string, number>();
  // The cache avoids re-hashing and lets us remember flagged images for a while.
  private tempStorage = new Cache({
    persistPath: "./cache_automod.json",
    persistIntervalMs: 5 * 60 * 1000, // every 5 minutes
    cleanupIntervalMs: 60 * 60 * 1000, // every hour
  });
  constructor(client: UsingClient) {
    this.client = client;
  }

  private extractLinks(content: string): string[] {
    if (!content) return [];
    const matches = content.match(/https?:\/\/[^\s>]+/gi);
    return matches ?? [];
  }

  private extractHostname(rawUrl: string): string {
    try {
      const url = new URL(rawUrl);
      return url.hostname.toLowerCase();
    } catch {
      const cleaned = rawUrl.replace(/^https?:\/\//i, "");
      const host = cleaned.split(/[\/\s?#]/)[0] ?? "";
      return host.toLowerCase();
    }
  }

  private isWhitelisted(hostname: string, domains: string[]): boolean {
    if (!hostname) return false;
    for (const domain of domains) {
      const normalized = domain.toLowerCase();
      if (!normalized) continue;
      if (hostname === normalized) return true;
      if (hostname.endsWith(`.${normalized}`)) return true;
    }
    return false;
  }

  private isShortener(hostname: string, allowed: string[]): boolean {
    if (!hostname) return false;
    const host = hostname.toLowerCase();
    return allowed.some(
      (entry) => host === entry || host.endsWith(`.${entry}`),
    );
  }

  private async resolveFinalUrl(rawUrl: string): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(rawUrl, {
        signal: controller.signal,
        redirect: "follow",
      });
      return res.url ?? null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async runLinkSpamFilter(message: Message): Promise<boolean> {
    const guildId = (message as any).guildId ?? message.member?.guildId;
    if (!guildId) return false;

    const config = await configStore.get(
      guildId,
      ConfigurableModule.AutomodLinkSpam,
    );
    if (!config.enabled) return false;

    const whitelistConfig = await configStore.get(
      guildId,
      ConfigurableModule.AutomodDomainWhitelist,
    );
    const whitelistEnabled =
      whitelistConfig.enabled && whitelistConfig.domains.length > 0;

    const shortenersConfig = await configStore.get(
      guildId,
      ConfigurableModule.AutomodShorteners,
    );
    const shortenersEnabled = shortenersConfig.enabled;
    const shortenersAllowed = shortenersConfig.allowedShorteners
      .map((d: string) => d.toLowerCase().trim())
      .filter(Boolean);

    const userId = message.author?.id;
    if (!userId) return false;

    const now = Date.now();
    const cooldownKey = `${guildId}:${userId}`;
    const until = this.linkSpamCooldown.get(cooldownKey);
    if (until && until > now) return false;

    const links = this.extractLinks(message.content ?? "");
    if (!links.length) return false;

    const allowedDomains = whitelistEnabled
      ? whitelistConfig.domains
        .map((d: string) => d.toLowerCase().trim())
        .filter(Boolean)
      : [];
    const filteredLinks: string[] = [];
    for (const link of links) {
      const hostname = this.extractHostname(link);
      if (shortenersEnabled && this.isShortener(hostname, shortenersAllowed)) {
        if (shortenersConfig.resolveFinalUrl) {
          const resolved = await this.resolveFinalUrl(link);
          if (resolved) {
            const resolvedHost = this.extractHostname(resolved);
            if (
              whitelistEnabled &&
              this.isWhitelisted(resolvedHost, allowedDomains)
            ) {
              continue;
            }
          }
        }
        filteredLinks.push(link);
        continue;
      }

      if (whitelistEnabled && this.isWhitelisted(hostname, allowedDomains)) {
        continue;
      }
      filteredLinks.push(link);
    }
    const filteredCount = links.length - filteredLinks.length;
    if (!filteredLinks.length) return false;

    const windowMs = Math.max(1, Number(config.windowSeconds || 10)) * 1000;
    const maxLinks = Math.max(1, Number(config.maxLinks || 4));

    let guildMap = this.linkSpamState.get(guildId);
    if (!guildMap) {
      guildMap = new Map();
      this.linkSpamState.set(guildId, guildMap);
    }

    const list = guildMap.get(userId) ?? [];
    const cutoff = now - windowMs;
    const filtered = list.filter((t) => t >= cutoff);

    for (let i = 0; i < filteredLinks.length; i++) filtered.push(now);

    guildMap.set(userId, filtered);

    if (filtered.length === 0) {
      guildMap.delete(userId);
    }

    if (filtered.length <= maxLinks) return false;

    this.linkSpamCooldown.set(cooldownKey, now + windowMs);

    const channelId = (message as any).channelId ?? (message as any).channel_id;
    const channelLabel = channelId ? `<#${channelId}>` : "Unknown channel";
    const messageUrl = (message as any).url ?? "";

    await logModerationAction(
      this.client,
      guildId,
      {
        title: "AutoMod: LinkSpam",
        description: [
          "Detectado posible spam de links.",
          `User: <@${userId}>`,
          `Channel: ${channelLabel}`,
          messageUrl ? `Mensaje: ${messageUrl}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        fields: [
          {
            name: "Links (mensaje)",
            value:
              filteredLinks
                .map((l) => `\`${l}\``)
                .join("\n")
                .slice(0, 1024) || "-",
          },
          {
            name: "Conteo (ventana)",
            value: `${filtered.length}/${maxLinks} en ${Math.round(windowMs / 1000)}s`,
            inline: true,
          },
          {
            name: "Whitelist",
            value: whitelistEnabled
              ? `${filteredCount} filtered`
              : "disabled",
            inline: true,
          },
        ],
        actorId: null,
      },
      "messageLogs",
    );

    const timeoutMs = Math.max(1, Number(config.timeoutSeconds || 300)) * 1000;
    const action = config.action ?? "timeout";
    if (action === "delete") {
      await message.delete?.().catch(() => undefined);
    } else if (action === "report") {
      const reportChannelId = config.reportChannelId ?? null;
      if (reportChannelId && isSnowflake(reportChannelId)) {
        await this.client.messages
          .write(reportChannelId, {
            content: `AutoMod LinkSpam: <@${userId}> in ${channelId ? `<#${channelId}>` : "unknown channel"}`,
            embeds: [
              {
                title: "AutoMod LinkSpam",
                description: [
                  `User: <@${userId}>`,
                  channelId ? `Channel: <#${channelId}>` : "Channel: desconocido",
                  messageUrl ? `Mensaje: ${messageUrl}` : "",
                ]
                  .filter(Boolean)
                  .join("\n"),
                fields: [
                  {
                    name: "Links (mensaje)",
                    value:
                      filteredLinks
                        .map((l) => `\`${l}\``)
                        .join("\n")
                        .slice(0, 1024) || "-",
                  },
                  {
                    name: "Conteo (ventana)",
                    value: `${filtered.length}/${maxLinks} en ${Math.round(windowMs / 1000)}s`,
                    inline: true,
                  },
                  {
                    name: "Whitelist",
                    value: whitelistEnabled
                      ? `${filteredCount} filtered`
                      : "disabled",
                    inline: true,
                  },
                ],
              },
            ],
            allowed_mentions: { parse: [] },
          })
          .catch(() => undefined);
      }
    } else {
      if (await message.member?.moderatable?.()) {
        await message.member?.timeout?.(timeoutMs, "AutoMod: Link spam");
      }
    }

    return true;
  }
  /**
   * Singleton pattern: one instance per client as we store cache and OCR worker.
   */
  public static getInstance(client: UsingClient): AutoModSystem {
    if (!AutoModSystem.instance) {
      AutoModSystem.instance = new AutoModSystem(client);
    }
    return AutoModSystem.instance;
  }
  /**
   * Main moderation pipeline. Evaluates a message in a specific order.
   *
   * Purpose: Coordinate the detection of malicious content following a 
   * deterministic pipeline to avoid unnecessary processing and race conditions.
   *
   * Evaluation order (critical):
   *   1. Link spam detection - Fastest, fewer resources
   *   2. Text spam filters - Simple regex, no heavy I/O
   *   3. Image analysis - Costly OCR, only if no previous match
   *
   * @param message Discord message to analyze
   * @returns true if action was taken (mute, timeout, notification), false if nothing detected
   *
   * Side effects:
   *   - May apply timeout to the user (spam filters)
   *   - May send notifications to staff (suspicious images)
   *   - Writes to persistent cache (image analysis results)
   *   - Moderation action logging
   *
   * Invariants:
   *   - Processing stops at the first match to avoid multiple actions
   *   - Always returns boolean, never throws (errors are logged and return false)
   *   - Only processes attachments if no match in text/links
   *
   * RISK: Changing the evaluation order can impact performance and detection.
   *   Images are costly, so they go at the end of the pipeline.
   */
  public async analyzeUserMessage(message: Message): Promise<boolean> {
    try {
      const normalizedContent = message.content?.toLowerCase() ?? "";
      const attachments = (message.attachments ?? []) as AttachmentLike[];
      if (await this.runLinkSpamFilter(message)) {
        return true;
      }
      if (await this.runSpamFilters(message, normalizedContent)) {
        return true;
      }
      if (!this.shouldScanAttachments(message, attachments)) {
        return false;
      }
      for (const attachment of attachments) {
        const handled = await this.handleAttachment(message, attachment);
        if (handled) {
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error("AutoModSystem: error evaluando mensaje:", error);
      return false;
    }
  }
  /**
   * Applies regex-based spam filters to the message content.
   *
   * Purpose: Detect spam/scam patterns using predefined regular expressions,
   * applying configured actions based on the violation type.
   *
   * Behavior:
   *   - Iterates through all filters in order (no short-circuit)
   *   - Applies timeout (5 min) for filters with mute=true
   *   - Sends staff warning if the filter has a warnMessage
   *   - Returns at the first match (does not accumulate actions)
   *
   * @param message Message to analyze
   * @param normalizedContent Already lowercased content
   * @returns true if an action was applied, false if no match
   *
   * Side effects:
   *   - May apply timeout via Discord API
   *   - May send staff notifications
   *   - Moderation action logging
   *
   * Invariants:
   *   - Only one filter can act per message (first one that matches)
   *   - Timeout is fixed at 5 minutes (hardcoded config)
   *   - Filters without mute only notify, they don't sanction
   *
   * TODO: Implement filters without mute that only warn without sanctioning.
   *   Currently, filters with mute=false only send warnMessage but have no
   *   other specific defined behavior.
   */
  private async runSpamFilters(
    message: Message,
    normalizedContent: string,
  ): Promise<boolean> {
    for (const spamFilter of spamFilterList) {
      if (!spamFilter.filter.test(normalizedContent)) continue;
      if (spamFilter.mute) {
        await message.member?.timeout?.(
          FIVE_MINUTES,
          "Malicious content detected",
        );
      } else {
        // TODO: filters without mute
        // ? We could notify staff or similar
      }
      if (spamFilter.warnMessage) {
        await this.notifySuspiciousActivity(spamFilter.warnMessage, message);
      }
      return true;
    }
    return false;
  }
  /**
   * Decides if a message's attachments should be analyzed.
   *
   * Purpose: Quickly filter messages that don't require image analysis 
   * to avoid unnecessary (costly) OCR processing.
   *
   * Evaluation criteria:
   *   - Must have at least one attachment
   *   - At least one attachment must be an image (contentType starts with "image/")
   *   - Size is not validated here (it's done in fetchAttachmentBuffer)
   *
   * @param _message Message (not used, kept for consistent signature)
   * @param attachments Array of message attachments
   * @returns true if image analysis should proceed
   *
   * Invariants:
   *   - Only attachments with contentType "image/*" are processed
   *   - No limit on attachment count here
   *   - Messages without attachments or images return false immediately
   *
   * WHY: This separation allows for an early shortcut in the main pipeline
   *   without having to download or process unnecessary files.
   */
  private shouldScanAttachments(
    _message: Message,
    attachments: AttachmentLike[],
  ): boolean {
    if (attachments.length === 0) {
      return false;
    }
    const hasImageAttachment = attachments.some((attachment) =>
      attachment.contentType?.startsWith("image"),
    );
    if (!hasImageAttachment) {
      // We are only interested in attachments that are actually images.
      return false;
    }
    return true;
  }
  /**
   * Procesa un adjunto individual y detecta si es contenido malicioso.
   *
   * Propósito: Orquestar el análisis completo de un adjunto: descarga,
   * cache check, OCR analysis y notificación si es necesario.
   *
   * Flujo de procesamiento:
   *   1. Descarga adjunto (con validación de tamaño y timeout)
   *   2. Calcula hash perceptual para cache lookup
   *   3. Verifica cache: si "unsafe" previo, notifica y retorna
   *   4. Si no está en cache, ejecuta analyzeImage()
   *   5. Si detecta scam, cachea como "unsafe" y notifica staff
   *
   * @param message Mensaje original (para contexto de notificación)
   * @param attachment Adjunto a procesar
   * @returns true si se detectó contenido sospechoso, false si es seguro
   *
   * Side effects:
   *   - Descarga adjunto via HTTP (potencialmente grande)
   *   - Escribe en caché persistente (7 días)
   *   - Envía notificaciones al staff si detecta scams
   *   - Logging de resultados y errores
   *
   * Invariantes:
   *   - Solo procesa adjuntos con contentType "image/*"
   *   - Cache usa hash perceptual (phash) como clave
   *   - Resultados "unsafe" se cachean por ONE_WEEK (7 días)
   *   - Nunca elimina mensajes, solo notifica al staff
   *
   * RISK: La cache de 7 días puede propagar falsos positivos. No hay
   *   mecanismo de invalidación manual excepto reiniciar el bot.
   *
   * TODO: Añadir botones en notificación para borrar mensaje directamente
   *   y saltar al mensaje original. Actualmente solo se envía advertencia.
   */
  private async handleAttachment(
    message: Message,
    attachment: AttachmentLike,
  ): Promise<boolean> {
    if (!attachment.contentType?.startsWith("image")) {
      return false;
    }
    const imageBuffer = await this.fetchAttachmentBuffer(attachment.url);
    if (!imageBuffer) return false;
    const imageHash = await phash(imageBuffer, { failOnError: false });
    const cacheKey = `image:${imageHash}`;
    const cachedResult = await this.tempStorage.get(cacheKey);
    if (cachedResult === "unsafe") {
      await this.flagSuspiciousImage(message, attachment.url);
      return true;
    }
    const isUnsafeImage = await this.analyzeImage(imageBuffer);
    if (isUnsafeImage) {
      await this.tempStorage.set(cacheKey, "unsafe", ONE_WEEK);
      await this.flagSuspiciousImage(message, attachment.url);
      return true;
    }
    return false;
  }
  /**
   * Downloads attachment content from Discord URL.
   *
   * Purpose: Retrieve image ArrayBuffer with security validations 
   * and resource limits to avoid DoS or memory exhaustion.
   *
   * Applied validations:
   *   - 15-second download timeout
   *   - 8MB limit (MAX_AUTOMOD_IMAGE_BYTES)
   *   - content-length header verification when available
   *   - Early abort if size is exceeded during streaming
   *
   * @param url Discord attachment URL
   * @returns ArrayBuffer with image data or null if it fails
   *
   * Side effects:
   *   - HTTP request to Discord servers
   *   - Potential large memory allocation (up to 8MB)
   *   - Warning logging for failures and exceeded limits
   *
   * Invariants:
   *   - Never throws: always returns null on error
   *   - Strictly respects size and time limits
   *   - Supports streaming to stop large downloads early
   *
   * RISK: The 8MB limit may be insufficient for modern high-resolution images. 
   *   Consider increasing or implementing resizing before OCR.
   *
   * WHY: Streaming instead of downloading the whole buffer prevents 
   *   memory exhaustion with malicious or very large attachments.
   */
  private async fetchAttachmentBuffer(
    url: string,
  ): Promise<ArrayBuffer | null> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      ATTACHMENT_FETCH_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        console.warn("AutoModSystem: could not download image", {
          url,
          status: response.status,
        });
        return null;
      }

      const contentLength = response.headers.get("content-length");
      const reportedSize = contentLength ? Number(contentLength) : NaN;
      if (
        Number.isFinite(reportedSize) &&
        reportedSize > MAX_AUTOMOD_IMAGE_BYTES
      ) {
        console.warn("AutoModSystem: imagen demasiado grande para analizar", {
          url,
          reportedSize,
        });
        return null;
      }

      const body = response.body;
      if (!body) {
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_AUTOMOD_IMAGE_BYTES) {
          console.warn("AutoModSystem: image too large to analyze", {
            url,
            byteLength: buffer.byteLength,
          });
          return null;
        }
        return buffer;
      }

      const reader = body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        total += value.byteLength;
        if (total > MAX_AUTOMOD_IMAGE_BYTES) {
          controller.abort();
          console.warn("AutoModSystem: image too large to analyze", {
            url,
            total,
          });
          return null;
        }

        chunks.push(value);
      }

      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }

      return merged.buffer;
    } catch (error) {
      console.warn("AutoModSystem: image download failed", { url, error });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Analyzes an attachment image using OCR to detect scam text.
   *
   * Purpose: Extract text from images using PaddleOCR and check if it matches
   * known scam patterns (crypto, free nitro, etc).
   *
   * Flow:
   *   1. Extract text using OCR (with aggressive preprocessing)
   *   2. Normalize to lowercase
   *   3. Check against scamFilterList (regex patterns)
   *   4. Return first pattern that matches (if any)
   *
   * @param buffer ArrayBuffer of the image (already validated and downloaded)
   * @returns RegExp of the matched pattern or undefined if no match
   *
   * Side effects:
   *   - Initializes OCR service if unavailable (lazy loading)
   *   - CPU intensive processing (OCR + preprocessing)
   *   - Serializes tasks in queue to avoid overload
   *
   * Invariants:
   *   - Always returns RegExp or undefined, never throws
   *   - OCR can return empty string if no text detected
   *   - Only detects text-based scams, not visual analysis
   *
   * RISK: Preprocessing uses a fixed threshold(150) that may fail on images
   *   with variable lighting or low contrast. This can cause false negatives.
   *
   * ALT: adaptive thresholding or multiple thresholds were considered, but
   *   significantly impact performance and memory usage.
   */
  private async analyzeImage(buffer: ArrayBuffer) {
    const text = await recognizeText(buffer);
    const normalizedText = text.toLowerCase();
    return scamFilterList.find((filter: RegExp) => filter.test(normalizedText));
  }

  /**
   * Notifies staff about a suspicious image.
   */
  private async flagSuspiciousImage(message: Message, attachmentUrl: string) {
    await this.notifySuspiciousActivity(
      `Suspicious image. ${message.author.tag}: ${attachmentUrl}`,
      message,
    );
  }
  /**
   * Warning to the moderation team. If it fails, we don't stop the flow because the message might already be gone.
   */
  private async notifySuspiciousActivity(warning: string, message: Message) {
    // Obtener canal de staff desde la base de datos
    const guildId = message.member?.guildId;
    if (!guildId) {
      console.error(
        "AutoModSystem: could not obtain guild ID from message when trying to notify staff.",
      );
      return;
    }
    const channels = await getGuildChannels(guildId);
    const staffChannel = (
      channels.core as Record<string, CoreChannelRecord | null>
    ).staff;
    if (!staffChannel) {
      console.error(
        "AutoModSystem: could not obtain staff channel for the guild when trying to notify staff.",
      );
      return;
    }
    const fetched = await fetchStoredChannel(
      this.client,
      staffChannel.channelId,
      () =>
        updateGuildPaths(guildId, {
          "channels.core.staff": null,
        }),
    );
    if (!fetched.channel || !fetched.channelId) {
      console.error(
        "AutoModSystem: the configured staff channel does not exist or is invalid.",
      );
      return;
    }
    if (!fetched.channel.isTextGuild()) {
      console.error(
        "AutoModSystem: the configured staff channel is not a text channel.",
      );
      return;
    }
    // TODO: buttons to delete message directly and jump to message
    await this.client.messages
      .write(fetched.channelId, {
        content: `**Warning:** ${warning}. ${message.url ?? ""}`,
      })
      .catch(async (err: Error) => {
        if (isUnknownChannelError(err)) {
          await updateGuildPaths(guildId, {
            "channels.core.staff": null,
          });
        }
        console.error("AutoModSystem: Error warning staff:", err);
      });
  }
}

