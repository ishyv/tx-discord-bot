/**
 * Motivación: reutilizar fragmentos y construcciones de mensajes que se repiten en las respuestas del bot.
 *
 * Idea/concepto: agrupa helpers puros para componer textos/embeds sin necesidad de copiar plantillas.
 *
 * Alcance: utilidades de presentación; no disparan efectos secundarios ni consultan datos externos.
 */
import type { Message, UsingClient } from "seyfert";

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

    if (isReplyable(target) && reply) {
      const payload: Record<string, unknown> = {
        content: message,
        allowed_mentions: { parse: [] },
      };
      if (components?.length && index === lastIndex) {
        payload.components = components as unknown[];
      }
      await client.messages.write(target?.channelId ?? "", {
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
    } else {
      throw new Error("Objetivo no soportado para enviar mensajes paginados.");
    }
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
