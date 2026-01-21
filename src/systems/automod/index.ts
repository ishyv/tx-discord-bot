/**
 * AutoMod System: Detección de contenido malicioso en mensajes y adjuntos.
 *
 * Propósito: Orquestar el pipeline completo de moderación automática para un guild,
 * coordinando detección de spam de links, filtros de texto y análisis de imágenes con OCR.
 *
 * Encaje en el sistema: Capa de orquestación principal que consume:
 *   - Filtros de spam/links (constants/automod)
 *   - Servicio OCR (services/ocr)
 *   - Caché persistente (utils/cache)
 *   - Logging de moderación (utils/moderationLogger)
 *
 * Invariantes clave:
 *   - Singleton por instancia de cliente (comparte caché y worker OCR)
 *   - Pipeline ordenado: links → texto → imágenes (se detiene al primer match)
 *   - Solo imágenes con contentType "image/*" son procesadas
 *   - Resultados "unsafe" se cachean por 7 días para evitar reprocesamiento
 *
 * Tradeoffs y decisiones:
 *   - Staff-only moderation: Notifica pero no actúa automáticamente para evitar falsos positivos
 *   - Fixed OCR preprocessing: Threshold(150) es rápido pero frágil a condiciones de iluminación
 *   - Long cache duration: 7 días reduce carga pero arrastra falsos positivos
 *
 * Riesgos conocidos:
 *   - OCR puede fallar en imágenes con iluminación variable o texto manuscrito
 *   - Cache largo puede propagar falsos positivos por una semana
 *   - Sin reintentos: Fallos de OCR se marcan como "no detectado" permanentemente
 *
 * Gotchas:
 *   - El sistema se llama "scan detection" pero solo detecta texto de estafas, no clasifica tipos de imágenes
 *   - Las imágenes se descargan completamente en memoria (límite 8MB)
 *   - El servicio OCR puede volverse "unavailable" permanentemente si falla la inicialización
 */
import type { Message, UsingClient } from "seyfert";
import { scamFilterList, spamFilterList } from "@/constants/automod";
import { updateGuildPaths } from "@/db/repositories/guilds";
import type { CoreChannelRecord } from "@/db/schemas/guild";
import { getGuildChannels } from "@/modules/guild-channels";
import { recognizeText } from "@/services/ocr";
import { Cache } from "@/utils/cache";
import { fetchStoredChannel, isUnknownChannelError } from "@/utils/channelGuard";
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
 * Núcleo del AutoMod del servidor: revisa texto rápido y luego analiza adjuntos según haga falta.
 */
export class AutoModSystem {
  private client: UsingClient;
  private static instance: AutoModSystem | null = null;
  private linkSpamState = new Map<string, Map<string, number[]>>();
  private linkSpamCooldown = new Map<string, number>();
  // La caché evita rehacer hashes y nos deja recordar imágenes marcadas un tiempo.
  private tempStorage = new Cache({
    persistPath: "./cache_automod.json",
    persistIntervalMs: 5 * 60 * 1000, // cada 5 minutos
    cleanupIntervalMs: 60 * 60 * 1000, // cada hora
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
    return allowed.some((entry) => host === entry || host.endsWith(`.${entry}`));
  }

  private async resolveFinalUrl(rawUrl: string): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(rawUrl, { signal: controller.signal, redirect: "follow" });
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

    const config = await configStore.get(guildId, ConfigurableModule.AutomodLinkSpam);
    if (!config.enabled) return false;

    const whitelistConfig = await configStore.get(
      guildId,
      ConfigurableModule.AutomodDomainWhitelist,
    );
    const whitelistEnabled = whitelistConfig.enabled && whitelistConfig.domains.length > 0;

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
      ? whitelistConfig.domains.map((d: string) => d.toLowerCase().trim()).filter(Boolean)
      : [];
    const filteredLinks: string[] = [];
    for (const link of links) {
      const hostname = this.extractHostname(link);
      if (shortenersEnabled && this.isShortener(hostname, shortenersAllowed)) {
        if (shortenersConfig.resolveFinalUrl) {
          const resolved = await this.resolveFinalUrl(link);
          if (resolved) {
            const resolvedHost = this.extractHostname(resolved);
            if (whitelistEnabled && this.isWhitelisted(resolvedHost, allowedDomains)) {
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
    const channelLabel = channelId ? `<#${channelId}>` : "Canal desconocido";
    const messageUrl = (message as any).url ?? "";

    await logModerationAction(
      this.client,
      guildId,
      {
        title: "AutoMod: LinkSpam",
        description: [
          "Detectado posible spam de links.",
          `Usuario: <@${userId}>`,
          `Canal: ${channelLabel}`,
          messageUrl ? `Mensaje: ${messageUrl}` : "",
        ].filter(Boolean).join("\n"),
        fields: [
          { name: "Links (mensaje)", value: filteredLinks.map((l) => `\`${l}\``).join("\n").slice(0, 1024) || "-" },
          { name: "Conteo (ventana)", value: `${filtered.length}/${maxLinks} en ${Math.round(windowMs / 1000)}s`, inline: true },
          { name: "Whitelist", value: whitelistEnabled ? `${filteredCount} filtrados` : "desactivado", inline: true },
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
            content: `AutoMod LinkSpam: <@${userId}> en ${channelId ? `<#${channelId}>` : "canal desconocido"}`,
            embeds: [
              {
                title: "AutoMod LinkSpam",
                description: [
                  `Usuario: <@${userId}>`,
                  channelId ? `Canal: <#${channelId}>` : "Canal: desconocido",
                  messageUrl ? `Mensaje: ${messageUrl}` : "",
                ].filter(Boolean).join("\n"),
                fields: [
                  {
                    name: "Links (mensaje)",
                    value: filteredLinks.map((l) => `\`${l}\``).join("\n").slice(0, 1024) || "-",
                  },
                  {
                    name: "Conteo (ventana)",
                    value: `${filtered.length}/${maxLinks} en ${Math.round(windowMs / 1000)}s`,
                    inline: true,
                  },
                  {
                    name: "Whitelist",
                    value: whitelistEnabled ? `${filteredCount} filtrados` : "desactivado",
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
   * Patrón singleton: una instancia por cliente porque guardamos caché y worker OCR.
   */
  public static getInstance(client: UsingClient): AutoModSystem {
    if (!AutoModSystem.instance) {
      AutoModSystem.instance = new AutoModSystem(client);
    }
    return AutoModSystem.instance;
  }
  /**
   * Pipeline principal de moderación. Evalúa un mensaje en orden específico.
   *
   * Propósito: Coordinar la detección de contenido malicioso siguiendo un pipeline
   * determinista para evitar procesamiento innecesario y race conditions.
   *
   * Orden de evaluación (crítico):
   *   1. Link spam detection - Más rápido, menos recursos
   *   2. Text spam filters - Regex simple, sin I/O pesado
   *   3. Image analysis - OCR costoso, solo si no hay match previo
   *
   * @param message Mensaje de Discord a analizar
   * @returns true si se actuó sobre el mensaje (mute, timeout, notificación), false si no se detectó nada
   *
   * Side effects:
   *   - Puede aplicar timeout al usuario (spam filters)
   *   - Puede enviar notificaciones al staff (imágenes sospechosas)
   *   - Escribe en caché persistente (resultados de análisis de imágenes)
   *   - Logging de acciones de moderación
   *
   * Invariantes:
   *   - El procesamiento se detiene al primer match para evitar acciones múltiples
   *   - Siempre retorna boolean, nunca lanza (errores se loguean y retornan false)
   *   - Solo procesa adjuntos si no hay match en texto/links
   *
   * RISK: Cambiar el orden de evaluación puede impactar performance y detección.
   *   Las imágenes son costosas, por eso van al final del pipeline.
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
   * Aplica filtros de spam basados en regex al contenido del mensaje.
   *
   * Propósito: Detectar patrones de spam/estafa mediante expresiones regulares
   * predefinidas, aplicando acciones configuradas según el tipo de infracción.
   *
   * Comportamiento:
   *   - Itera todos los filtros en orden (no hay cortocircuito)
   *   - Aplica timeout (5 min) para filtros con mute=true
   *   - Envía advertencia al staff si el filtro tiene warnMessage
   *   - Retorna al primer match (no acumula acciones)
   *
   * @param message Mensaje a analizar
   * @param normalizedContent Contenido ya normalizado a lowercase
   * @returns true si se aplicó alguna acción, false si no hubo match
   *
   * Side effects:
   *   - Puede aplicar timeout al usuario vía Discord API
   *   - Puede enviar notificaciones al staff
   *   - Logging de acciones de moderación
   *
   * Invariantes:
   *   - Solo un filtro puede accionar por mensaje (primero que matchea)
   *   - Timeout es de 5 minutos fijo (configuración hardcoded)
   *   - Los filtros sin mute solo notifican, no sancionan
   *
   * TODO: Implementar filtros sin mute que solo advierten sin sancionar.
   *   Actualmente los filtros con mute=false solo envían warnMessage pero no tienen
   *   otro comportamiento específico definido.
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
          "Contenido malisioso detectado",
        );
      } else {
        // TODO: filtros sin mute
        // ? Se podria avisar al staff o similar
      }
      if (spamFilter.warnMessage) {
        await this.notifySuspiciousActivity(spamFilter.warnMessage, message);
      }
      return true;
    }
    return false;
  }
  /**
   * Decide si los adjuntos de un mensaje deben ser analizados.
   *
   * Propósito: Filtrar rápidamente mensajes que no requieren análisis de imágenes
   * para evitar procesamiento OCR innecesario (costoso).
   *
   * Criterios de evaluación:
   *   - Debe tener al menos un adjunto
   *   - Al menos un adjunto debe ser imagen (contentType starts with "image/")
   *   - No se valida tamaño aquí (se hace en fetchAttachmentBuffer)
   *
   * @param _message Mensaje (no usado, mantenido para firma consistente)
   * @param attachments Array de adjuntos del mensaje
   * @returns true si se debe proceder con análisis de imágenes
   *
   * Invariantes:
   *   - Solo se procesan adjuntos con contentType "image/*"
   *   - No hay límite de cantidad de adjuntos aquí
   *   - Mensajes sin adjuntos o sin imágenes retornan false inmediatamente
   *
   * WHY: Esta separación permite shortcut temprano en el pipeline principal
   *   sin tener que descargar o procesar archivos innecesariamente.
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
      // Sólo nos interesan adjuntos que realmente sean imágenes.
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
   * Descarga el contenido de un adjunto desde URL de Discord.
   *
   * Propósito: Obtener el ArrayBuffer de una imagen con validaciones de seguridad
   * y límites de recursos para evitar DoS o agotamiento de memoria.
   *
   * Validaciones aplicadas:
   *   - Timeout de 15 segundos para descarga
   *   - Límite de 8MB (MAX_AUTOMOD_IMAGE_BYTES)
   *   - Verificación de content-length header cuando está disponible
   *   - Abort temprano si se excede el tamaño durante streaming
   *
   * @param url URL del adjunto de Discord
   * @returns ArrayBuffer con los datos de la imagen o null si falla
   *
   * Side effects:
   *   - Petición HTTP a servidores de Discord
   *   - Potencial allocation grande de memoria (hasta 8MB)
   *   - Logging de advertencias para fallos y límites excedidos
   *
   * Invariantes:
   *   - Nunca lanza: siempre retorna null en caso de error
   *   - Respeta límites estrictos de tamaño y tiempo
   *   - Soporta streaming para detener descargas grandes temprano
   *
   * RISK: El límite de 8MB puede ser insuficiente para imágenes de alta resolución
   *   modernas. Considerar aumentar o implementar resizing antes de OCR.
   *
   * WHY: Streaming en lugar de descargar todo el buffer previene agotamiento
   *   de memoria con adjuntos maliciosos o muy grandes.
   */
  private async fetchAttachmentBuffer(url: string): Promise<ArrayBuffer | null> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      ATTACHMENT_FETCH_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        console.warn("AutoModSystem: no se pudo descargar la imagen", {
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
          console.warn("AutoModSystem: imagen demasiado grande para analizar", {
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
          console.warn("AutoModSystem: imagen demasiado grande para analizar", {
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
      console.warn("AutoModSystem: fallo descargando imagen", { url, error });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Analiza una imagen adjunto usando OCR para detectar texto de estafas.
   *
   * Propósito: Extraer texto de imágenes mediante PaddleOCR y verificar si coincide
   * con patrones conocidos de estafas (crypto, nitro gratis, etc).
   *
   * Flujo:
   *   1. Extrae texto usando OCR (con preprocessing agresivo)
   *   2. Normaliza a lowercase
   *   3. Verifica contra scamFilterList (regex patterns)
   *   4. Retorna primer pattern que matchea (si existe)
   *
   * @param buffer ArrayBuffer de la imagen (ya validada y descargada)
   * @returns RegExp del pattern matcheado o undefined si no hay coincidencia
   *
   * Side effects:
   *   - Inicializa servicio OCR si no está disponible (lazy loading)
   *   - Procesamiento intensivo de CPU (OCR + preprocessing)
   *   - Serializa tareas en cola para evitar sobrecarga
   *
   * Invariantes:
   *   - Siempre retorna RegExp o undefined, nunca lanza
   *   - OCR puede retornar string vacío si no detecta texto
   *   - Solo detecta scams basados en texto, no análisis visual
   *
   * RISK: El preprocessing usa threshold(150) fijo que puede fallar en imágenes
   *   con iluminación variable o bajo contraste. Esto puede causar falsos negativos.
   *
   * ALT: Se consideró usar threshold adaptivo o múltiples umbrales, pero
   *   impacta significativamente la performance y el uso de memoria.
   */
  private async analyzeImage(buffer: ArrayBuffer) {
    const text = await recognizeText(buffer);
    const normalizedText = text.toLowerCase();
    return scamFilterList.find((filter: RegExp) => filter.test(normalizedText));
  }

  /**
   * Notifica al staff sobre una imagen sospechosa.
   */
  private async flagSuspiciousImage(message: Message, attachmentUrl: string) {
    await this.notifySuspiciousActivity(
      `Imagen sospechosa. ${message.author.tag}: ${attachmentUrl}`,
      message,
    );
  }
  /**
   * Aviso al equipo de moderación. Si falla, no frenamos el flujo porque quizá el mensaje ya no está.
   */
  private async notifySuspiciousActivity(warning: string, message: Message) {
    // Obtener canal de staff desde la base de datos
    const guildId = message.member?.guildId;
    if (!guildId) {
      console.error(
        "AutoModSystem: no se pudo obtener ID de la guild del mensaje al tratar de notificar al staff.",
      );
      return;
    }
    const channels = await getGuildChannels(guildId);
    const staffChannel = (
      channels.core as Record<string, CoreChannelRecord | null>
    ).staff;
    if (!staffChannel) {
      console.error(
        "AutoModSystem: no se pudo obtener canal de staff de la guild al tratar de notificar al staff.",
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
        "AutoModSystem: el canal de staff configurado no existe o es invalido.",
      );
      return;
    }
    if (!fetched.channel.isTextGuild()) {
      console.error(
        "AutoModSystem: el canal de staff configurado no es un canal de texto.",
      );
      return;
    }
    // TODO: botones para borrar el mensaje directamente y saltar al mensaje
    await this.client.messages
      .write(fetched.channelId, {
        content: `**Advertencia:** ${warning}. ${message.url ?? ""}`,
      })
      .catch(async (err: Error) => {
        if (isUnknownChannelError(err)) {
          await updateGuildPaths(guildId, {
            "channels.core.staff": null,
          });
        }
        console.error("AutoModSystem: Error al advertir al staff:", err);
      });
  }
}
