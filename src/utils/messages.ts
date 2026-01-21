/**
 * Motivación: reutilizar fragmentos y construcciones de mensajes que se repiten en las respuestas del bot.
 *
 * Idea/concepto: agrupa helpers puros para componer textos/embeds sin necesidad de copiar plantillas.
 *
 * Alcance: utilidades de presentación; no disparan efectos secundarios ni consultan datos externos.
 */
import type { Message, UsingClient } from "seyfert";
import { isSnowflake } from "@/utils/snowflake";

const DEFAULT_PAGE_LIMIT = 1900; // El limite por mensaje es aprox 2000 carácteres

export async function sendPaginatedMessages(
  client: UsingClient,
  target: Message,
  content: string,
  reply: boolean = false,
  components?: unknown[],
  pageSuffix?: string,
): Promise<void> {
  const safeLimit = getPageLimitWithSuffix(pageSuffix);
  const pages = paginateText(content, safeLimit);
  const lastIndex = pages.length - 1;

  for (const [index, page] of pages.entries()) {
    const base = page.trim();
    const message = pageSuffix ? `${base}${pageSuffix}` : base;
    if (!message) continue;

    const channelId = target?.channelId ?? "";
    if (!channelId) {
      console.warn(
        "sendPaginatedMessages: missing channelId; cannot send paginated message.",
      );
      return;
    }
    if (!isSnowflake(channelId)) {
      console.warn(
        "sendPaginatedMessages: invalid channelId; cannot send paginated message.",
      );
      return;
    }

    if (reply && !isReplyable(target)) {
      console.warn(
        "sendPaginatedMessages: target is not replyable; cannot send as reply.",
      );
      return;
    }

    const payload: Record<string, unknown> = {
      content: message,
      allowed_mentions: { parse: [] },
    };
    if (components?.length && index === lastIndex) {
      payload.components = components as unknown[];
    }
    await client.messages.write(channelId, {
      ...payload,
      ...(reply
        ? {
            message_reference: {
              message_id: target.id,
              guild_id: target.guildId,
              channel_id: target.channelId,
            },
          }
        : {}),
    });
  }
}

export async function sendPaginatedByReference(
  client: UsingClient,
  reference: { channelId: string; messageId: string; guildId?: string | null },
  content: string,
  components?: unknown[],
  pageSuffix?: string,
): Promise<void> {
  const safeLimit = getPageLimitWithSuffix(pageSuffix);
  const pages = paginateText(content, safeLimit);
  const lastIndex = pages.length - 1;

  for (const [index, page] of pages.entries()) {
    const base = page.trim();
    const message = pageSuffix ? `${base}${pageSuffix}` : base;
    if (!message) continue;

    if (!isSnowflake(reference.channelId)) {
      console.warn(
        "sendPaginatedByReference: invalid channelId; cannot send paginated message.",
      );
      return;
    }
    if (!isSnowflake(reference.messageId)) {
      console.warn(
        "sendPaginatedByReference: invalid messageId; cannot send paginated message.",
      );
      return;
    }
    if (reference.guildId && !isSnowflake(reference.guildId)) {
      console.warn(
        "sendPaginatedByReference: invalid guildId; cannot send paginated message.",
      );
      return;
    }

    const payload: Record<string, unknown> = {
      content: message,
      allowed_mentions: { parse: [] },
      message_reference: {
        message_id: reference.messageId,
        channel_id: reference.channelId,
        guild_id: reference.guildId ?? undefined,
      },
    };

    if (components?.length && index === lastIndex) {
      payload.components = components as unknown[];
    }

    await client.messages.write(reference.channelId, payload);
  }
}

export function paginateText(
  text: string,
  limit = DEFAULT_PAGE_LIMIT,
): string[] {
  const pages: string[] = [];
  let currentPage = "";

  for (const line of text.split("\n")) {
    const proposedPage = currentPage ? `${currentPage}\n${line}` : line;

    if (proposedPage.length > limit) {
      if (currentPage.trim().length > 0) {
        pages.push(currentPage.trim());
      }
      currentPage = line;
    } else {
      currentPage = proposedPage;
    }
  }

  if (currentPage.trim().length > 0) {
    pages.push(currentPage.trim());
  }

  return pages;
}

function isReplyable(
  target: unknown,
): target is { reply: (options: { content: string }) => Promise<unknown> } {
  return (
    typeof target === "object" &&
    target !== null &&
    "reply" in target &&
    typeof target.reply === "function"
  );
}

function getPageLimitWithSuffix(pageSuffix?: string): number {
  if (!pageSuffix) return DEFAULT_PAGE_LIMIT;

  const safeLimit = DEFAULT_PAGE_LIMIT - pageSuffix.length;
  return safeLimit > 0 ? safeLimit : DEFAULT_PAGE_LIMIT;
}
