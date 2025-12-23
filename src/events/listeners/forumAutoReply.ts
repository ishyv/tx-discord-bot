/**
 * Motivación: responder automáticamente con IA cuando se crea un post en foros monitoreados.
 *
 * Idea/concepto: escucha messageCreate, filtra posts iniciales en threads de forum y genera una respuesta útil.
 *
 * Alcance: orquesta el flujo; no maneja configuración ni persistencia fuera del config store.
 */
import type { ComponentContext } from "seyfert";
import { ActionRow } from "seyfert";
import { Button } from "@/modules/ui";
import { ButtonStyle, MessageFlags, MessageType } from "seyfert/lib/types";
import { FinishReason } from "@google/genai";
import { CONTINUE_PROMPT } from "@/constants/ai";
import { onMessageCreate } from "@/events/hooks/messageCreate";
import { configStore, ConfigurableModule } from "@/configuration";
import { generateForGuild } from "@/services/ai";
import { AI_GENERATED_MESSAGE_SUFFIX, markAIMessage } from "@/services/ai/messageTracker";
import { paginateText, sendPaginatedByReference, sendPaginatedMessages } from "@/utils/messages";
import { Cache } from "@/utils/cache";
import type { Message as AIMessage } from "@/utils/userMemory";

type AttachmentLike = {
  filename?: string | null;
  contentType?: string | null;
  size?: number | null;
  url?: string | null;
};

const RESPONDED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PROCESSING_TTL_MS = 2 * 60 * 1000;
const COOLDOWN_TTL_MS = 10 * 1000;
const MAX_CONTENT_CHARS = 4000;
const CONTINUE_BUTTON_LABEL = "Continuar";

const responseCache = new Cache<string>({
  persistPath: "./cache_forum_autoreply.json",
  persistIntervalMs: 5 * 60 * 1000,
  cleanupIntervalMs: 60 * 60 * 1000,
});

const CODE_EXTENSIONS = new Set([
  ".log",
  ".txt",
  ".md",
  ".json",
  ".js",
  ".ts",
  ".py",
  ".java",
  ".cs",
  ".cpp",
  ".c",
  ".rb",
  ".go",
  ".rs",
  ".php",
  ".html",
  ".css",
  ".yml",
  ".yaml",
  ".toml",
  ".xml",
  ".ini",
  ".cfg",
  ".conf",
  ".sql",
  ".sh",
  ".bat",
  ".ps1",
]);

onMessageCreate(async (message, client) => {
  if (!message.guildId) return;
  if (message.author?.bot) return;

  if (!isThreadStarterMessage(message)) return;

  const thread = await client.channels.fetch(message.channelId).catch(() => null);
  if (!thread || typeof thread.isThread !== "function" || !thread.isThread()) {
    return;
  }

  const threadId = thread.id;
  const parentId = (thread as { parentId?: string | null }).parentId ?? null;
  if (!parentId) return;

  const forum = await client.channels.fetch(parentId).catch(() => null);
  if (!forum || typeof forum.isForum !== "function" || !forum.isForum()) {
    return;
  }

  const { forumIds } = await configStore.get(
    message.guildId,
    ConfigurableModule.ForumAutoReply,
  );

  if (!forumIds.includes(parentId)) {
    logInfo(client, "skip:not-configured", {
      guildId: message.guildId,
      forumId: parentId,
      threadId,
    });
    return;
  }

  const cooldownKey = `cooldown:${parentId}`;
  if (await responseCache.get(cooldownKey)) {
    logInfo(client, "skip:cooldown", {
      guildId: message.guildId,
      forumId: parentId,
      threadId,
    });
    return;
  }

  const respondedKey = `responded:${threadId}`;
  if (await responseCache.get(respondedKey)) {
    logInfo(client, "skip:duplicate", {
      guildId: message.guildId,
      forumId: parentId,
      threadId,
    });
    return;
  }

  const processingKey = `processing:${threadId}`;
  if (await responseCache.get(processingKey)) {
    logInfo(client, "skip:processing", {
      guildId: message.guildId,
      forumId: parentId,
      threadId,
    });
    return;
  }

  await responseCache.set(processingKey, "1", PROCESSING_TTL_MS);
  await responseCache.set(cooldownKey, "1", COOLDOWN_TTL_MS);

  try {
    const title = thread.name ?? "Sin título";
    const rawContent = message.content ?? "";
    const content = truncate(rawContent, MAX_CONTENT_CHARS);
    const attachments = (message.attachments ?? []) as AttachmentLike[];
    const attachmentSummary = describeAttachments(attachments);
    const hasCodeOrLogs =
      hasInlineCode(content) || attachments.some(isLikelyCodeAttachment);
    const language = detectLanguage(`${title}\n${content}`);

    const prompt = buildPrompt({
      title,
      author: message.author?.username ?? "usuario",
      authorId: message.author?.id ?? "desconocido",
      content,
      attachmentSummary,
      hasCodeOrLogs,
      language,
      isEmpty: !content.trim() && attachments.length === 0,
    });

    const aiMessages: AIMessage[] = [{ role: "user", content: prompt }];
    const response = await generateForGuild({
      guildId: message.guildId,
      messages: aiMessages,
    });
    const reply = sanitizeReply(response.text ?? "");

    if (!reply || isFallbackReply(reply)) {
      logWarn(client, "ai:empty-or-fallback", {
        guildId: message.guildId,
        forumId: parentId,
        threadId,
      });
      return;
    }

    const authorId = message.author?.id;
    const rawText = response.meta?.rawText ?? response.text ?? "";
    const hasRawText = rawText.trim().length > 0;
    const continuationMessages = buildContinuationMessages(aiMessages, rawText);
    const components =
      response.meta?.finishReason === FinishReason.MAX_TOKENS && authorId && hasRawText
        ? [
            buildContinueRow({
              authorId,
              guildId: message.guildId,
              threadId,
              messages: continuationMessages,
            }),
          ]
        : undefined;

    let sent = false;
    try {
      await sendPaginatedMessages(
        client,
        message as any,
        reply,
        true,
        components,
        AI_GENERATED_MESSAGE_SUFFIX,
      );
      sent = true;
    } catch (error) {
      logWarn(client, "reply:failed", {
        guildId: message.guildId,
        forumId: parentId,
        threadId,
        error,
      });

      const pages = paginateText(reply);
      const lastIndex = pages.length - 1;

      for (const [index, page] of pages.entries()) {
        try {
          await client.messages.write(threadId, {
            content: markAIMessage(page),
            allowed_mentions: { parse: [] },
            ...(components && index === lastIndex ? { components } : {}),
          });
          sent = true;
        } catch (err: unknown) {
          logWarn(client, "write:failed", {
            guildId: message.guildId,
            forumId: parentId,
            threadId,
            error: err,
          });
          sent = false;
          break;
        }
      }
    }

    if (sent) {
      await responseCache.set(respondedKey, "1", RESPONDED_TTL_MS);
    }
  } catch (error) {
    logWarn(client, "unexpected-error", {
      guildId: message.guildId,
      forumId: parentId,
      threadId,
      error,
    });
  } finally {
    await responseCache.del(processingKey);
  }
});

function isThreadStarterMessage(message: { type?: number; id?: string; channelId?: string }) {
  if (message.type === MessageType.ThreadStarterMessage) return true;
  if (message.id && message.channelId && message.id === message.channelId) return true;
  return false;
}

function truncate(value: string, max: number): string {
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function hasInlineCode(content: string): boolean {
  if (!content) return false;
  return /```[\s\S]*```/.test(content) || /`[^`]+`/.test(content);
}

function isLikelyCodeAttachment(attachment: AttachmentLike): boolean {
  const filename = attachment.filename ?? "";
  const ext = filename.includes(".")
    ? filename.slice(filename.lastIndexOf(".")).toLowerCase()
    : "";
  if (ext && CODE_EXTENSIONS.has(ext)) return true;

  const contentType = attachment.contentType ?? "";
  if (!contentType) return false;
  if (contentType.startsWith("text/")) return true;
  return /json|xml|yaml|yml|toml|sql/.test(contentType);
}

function describeAttachments(attachments: AttachmentLike[]): string {
  if (!attachments.length) return "Sin adjuntos.";

  return attachments
    .map((attachment) => {
      const name = attachment.filename ?? "archivo";
      const type = attachment.contentType ?? "tipo desconocido";
      const size =
        typeof attachment.size === "number"
          ? `, ${Math.round(attachment.size / 1024)}KB`
          : "";
      return `${name} (${type}${size})`;
    })
    .join("; ");
}

function detectLanguage(text: string): "es" | "en" | "unknown" {
  const normalized = ` ${text.toLowerCase()} `;
  const spanishHints = [
    " el ",
    " la ",
    " de ",
    " que ",
    " y ",
    " en ",
    " un ",
    " una ",
    " para ",
    " por ",
    " con ",
    " no ",
    " como ",
  ];
  const englishHints = [
    " the ",
    " and ",
    " to ",
    " of ",
    " is ",
    " in ",
    " for ",
    " with ",
    " you ",
    " your ",
    " not ",
  ];

  let scoreEs = spanishHints.reduce(
    (acc, hint) => acc + (normalized.includes(hint) ? 1 : 0),
    0,
  );
  let scoreEn = englishHints.reduce(
    (acc, hint) => acc + (normalized.includes(hint) ? 1 : 0),
    0,
  );

  if (/[áéíóúñ¿¡]/i.test(text)) {
    scoreEs += 2;
  }

  if (scoreEs === 0 && scoreEn === 0) return "unknown";
  if (scoreEs === scoreEn) return "unknown";
  return scoreEs > scoreEn ? "es" : "en";
}

function buildPrompt(input: {
  title: string;
  author: string;
  authorId: string;
  content: string;
  attachmentSummary: string;
  hasCodeOrLogs: boolean;
  language: "es" | "en" | "unknown";
  isEmpty: boolean;
}): string {
  const languageLabel =
    input.language === "es"
      ? "espanol"
      : input.language === "en"
        ? "ingles"
        : "desconocido";

  return [
    "Eres un asistente tecnico para un foro de Discord.",
    "Responde en el mismo idioma del post.",
    `Idioma detectado: ${languageLabel}.`,
    "Si faltan datos clave, pide solo el contexto minimo necesario con un tono natural.",
    "Propon pasos concretos y diagnosticos.",
    "No dejes backticks sin cerrar; si usas bloques de codigo, cierralos.",
    "Incluye un disclaimer breve solo si el tema puede ser medico, legal, financiero o de alto riesgo.",
    "Evita respuestas genericas o que no aporten valor.",
    "Esta prohibido cualquier tema ilegal, inmoral o inapropiado.",
    "Si el post esta vacio o no tiene suficiente informacion, pide mas detalles de forma educada.",
    "",
    "Contexto del post:",
    `- Titulo: ${input.title}`,
    `- Autor: ${input.author} (${input.authorId})`,
    `- Contenido: ${input.content || "(sin contenido)"}`,
    `- Adjuntos: ${input.attachmentSummary}`,
    `- Logs/codigo adjuntos o inline: ${input.hasCodeOrLogs ? "si" : "no"}`,
    `- Post vacio: ${input.isEmpty ? "si" : "no"}`,
  ].join("\n");
}

function isFallbackReply(reply: string): boolean {
  const normalized = reply.toLowerCase();
  return normalized.includes("sushi");
}

function sanitizeReply(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return closeUnbalancedBackticks(trimmed);
}

function closeUnbalancedBackticks(text: string): string {
  let inCodeBlock = false;
  let inInline = false;

  for (let i = 0; i < text.length; i += 1) {
    if (text.startsWith("```", i)) {
      inCodeBlock = !inCodeBlock;
      i += 2;
      continue;
    }

    if (text[i] === "`" && !inCodeBlock) {
      inInline = !inInline;
    }
  }

  if (inCodeBlock) {
    return `${text}\n\`\`\``;
  }
  if (inInline) {
    return `${text}\``;
  }
  return text;
}

function buildContinuationMessages(
  messages: AIMessage[],
  lastResponse: string,
): AIMessage[] {
  const trimmed = lastResponse.trim();
  if (!trimmed) return [...messages];
  return [
    ...messages,
    { role: "model", content: trimmed },
    { role: "user", content: CONTINUE_PROMPT },
  ];
}

function buildContinueRow(options: {
  authorId: string;
  guildId: string;
  threadId: string;
  messages: AIMessage[];
}): ActionRow<Button> {
  const button = new Button()
    .setLabel(CONTINUE_BUTTON_LABEL)
    .setStyle(ButtonStyle.Primary)
    .onClick("forum_ai_continue", async (ctx) => {
      await handleForumContinuation(ctx, options);
    });

  return new ActionRow<Button>().addComponents(button);
}

async function handleForumContinuation(
  ctx: ComponentContext<"Button">,
  options: {
    authorId: string;
    guildId: string;
    threadId: string;
    messages: AIMessage[];
  },
): Promise<void> {
  if (ctx.author?.id !== options.authorId) {
    await ctx.write({
      content: "Solo el autor del post puede continuar la respuesta.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const response = await generateForGuild({
    guildId: options.guildId,
    messages: options.messages,
  });
  const reply = sanitizeReply(response.text ?? "");

  if (!reply || isFallbackReply(reply)) {
    ctx.client.logger?.warn?.("[forum-auto-reply] continue:empty-or-fallback", {
      guildId: options.guildId,
      threadId: options.threadId,
    });
    return;
  }

  const rawText = response.meta?.rawText ?? response.text ?? "";
  const hasRawText = rawText.trim().length > 0;
  const nextMessages = buildContinuationMessages(options.messages, rawText);
  const components =
    response.meta?.finishReason === FinishReason.MAX_TOKENS && hasRawText
      ? [
          buildContinueRow({
            authorId: options.authorId,
            guildId: options.guildId,
            threadId: options.threadId,
            messages: nextMessages,
          }),
        ]
      : undefined;

  const channelId = ctx.channelId ?? options.threadId;
  const messageId = ctx.interaction.message?.id;

  if (!channelId || !messageId) {
    await ctx.write({
      content: "No pude enviar la continuacion.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await sendPaginatedByReference(
      ctx.client,
      { channelId, messageId, guildId: options.guildId },
      reply,
      components,
      AI_GENERATED_MESSAGE_SUFFIX,
    );
  } catch (error) {
    ctx.client.logger?.warn?.("[forum-auto-reply] continue:send-failed", {
      guildId: options.guildId,
      threadId: options.threadId,
      error,
    });
  }
}

function logInfo(client: { logger?: any }, reason: string, context: Record<string, unknown>) {
  client.logger?.info?.(`[forum-auto-reply] ${reason}`, context);
}

function logWarn(client: { logger?: any }, reason: string, context: Record<string, unknown>) {
  client.logger?.warn?.(`[forum-auto-reply] ${reason}`, context);
}


