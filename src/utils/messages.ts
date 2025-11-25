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
): Promise<void> {
  const pages = paginateText(content);

  for (const page of pages) {
    const message = page.trim();
    if (!message) continue;

    if (isReplyable(target) && reply) {
      await client.messages.write(target?.channelId ?? "", {
        content: message,
        allowed_mentions: { parse: [] },
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
