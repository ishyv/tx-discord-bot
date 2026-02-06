/**
 * Motivación: encapsular la reacción al evento "ai Response" para mantener la lógica en un módulo autocontenido.
 *
 * Idea/concepto: se suscribe a los hooks correspondientes y coordina servicios o sistemas que deben ejecutarse.
 *
 * Alcance: orquesta el flujo específico del listener; no define el hook ni registra el evento base.
 */
import type { ComponentContext } from "seyfert";
import { ActionRow } from "seyfert";
import { Button } from "@/modules/ui";
import { ButtonStyle, MessageFlags } from "seyfert/lib/types";
import { FinishReason } from "@google/genai";
import { CONTINUE_PROMPT } from "@/constants/ai";
import { onMessageCreate } from "@/events/hooks/messageCreate";
import { processMessage, type AIResponse } from "@/services/ai";
import {
  AI_GENERATED_MESSAGE_SUFFIX,
  isAIMessage,
  markAIMessage,
  stripAIMessageMarker,
} from "@/services/ai/messageTracker";
import {
  sendPaginatedByReference,
  sendPaginatedMessages,
} from "@/utils/messages";

/**
 * Listener que responde menciones al bot utilizando el servicio de IA.
 */
onMessageCreate(async (message, client) => {
  const { author, content } = message;

  if (author?.bot) {
    return;
  }

  // Si el bot no fue mencionado directamente, no responder (lógica consolidada abajo)

  const wasMentioned = message.mentions.users.find(
    (user) => user.id === client.applicationId,
  );
  const replyContext = await resolveReplyContext(message, client);
  const shouldReply = Boolean(wasMentioned) || replyContext.isReplyToAIMessage;

  if (!shouldReply) {
    return;
  }

  const cleanedContent =
    stripBotMention(content, client.applicationId).trim() || content;

  const response = await processMessage({
    userId: author.id,
    message: cleanedContent,
    quotedText: replyContext.quotedText ?? undefined,
    guildId: message.guildId,
  });

  const components =
    response.meta?.finishReason === FinishReason.MAX_TOKENS
      ? [buildContinueRow({ authorId: author.id, guildId: message.guildId })]
      : undefined;

  if (response.image) {
    const file = {
      filename: "sushi.png",
      data: response.image,
    };

    await message.reply({
      content: markAIMessage(response.text),
      files: [file],
      ...(components ? { components } : {}),
    });
    return;
  }

  await sendPaginatedMessages(
    client,
    message,
    response.text,
    true,
    components,
    AI_GENERATED_MESSAGE_SUFFIX,
  );
});

const CONTINUE_BUTTON_LABEL = "Continuar";

function buildContinueRow(options: {
  authorId: string;
  guildId?: string | null;
}): ActionRow<Button> {
  const button = new Button()
    .setLabel(CONTINUE_BUTTON_LABEL)
    .setStyle(ButtonStyle.Primary)
    .onClick("ai_continue", async (ctx) => {
      if (ctx.author?.id !== options.authorId) {
        await ctx.write({
          content: "Only the requesting user can continue.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const response = await processMessage({
        userId: options.authorId,
        message: CONTINUE_PROMPT,
        guildId: options.guildId ?? ctx.guildId,
      });

      await sendContinuationResponse(
        ctx,
        response,
        options.authorId,
        options.guildId,
      );
    });

  return new ActionRow<Button>().addComponents(button);
}

async function sendContinuationResponse(
  ctx: ComponentContext<"Button">,
  response: AIResponse,
  authorId: string,
  guildId?: string | null,
): Promise<void> {
  const channelId = ctx.channelId ?? ctx.interaction.message?.channelId;
  const messageId = ctx.interaction.message?.id;

  if (!channelId || !messageId) {
    await ctx.write({
      content: "No pude enviar la continuacion.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const components =
    response.meta?.finishReason === FinishReason.MAX_TOKENS
      ? [buildContinueRow({ authorId, guildId })]
      : undefined;

  if (response.image) {
    const file = {
      filename: "sushi.png",
      data: response.image,
    };

    await ctx.client.messages.write(channelId, {
      content: markAIMessage(response.text),
      files: [file],
      ...(components ? { components } : {}),
      message_reference: {
        message_id: messageId,
        channel_id: channelId,
        guild_id: guildId ?? undefined,
      },
    });
    return;
  }

  await sendPaginatedByReference(
    ctx.client,
    { channelId, messageId, guildId },
    response.text,
    components,
    AI_GENERATED_MESSAGE_SUFFIX,
  );
}

type ReplyContext = {
  isReplyToAIMessage: boolean;
  quotedText?: string | null;
};

async function resolveReplyContext(
  message: any,
  client: any,
): Promise<ReplyContext> {
  const referenceId =
    message?.messageReference?.messageId ??
    message?.messageReference?.message_id;
  if (!referenceId) return { isReplyToAIMessage: false };

  const referenceChannelId =
    message?.messageReference?.channelId ??
    message?.messageReference?.channel_id ??
    message.channelId;

  const referenced =
    message.referencedMessage ??
    (await fetchReferencedMessage(client, referenceId, referenceChannelId));

  const referencedContent =
    typeof referenced?.content === "string" ? referenced.content : null;
  const isReplyToBot = referenced?.author?.id === client.applicationId;
  const isReplyToAI = Boolean(isReplyToBot) && isAIMessage(referencedContent);

  if (!isReplyToAI) return { isReplyToAIMessage: false };

  const quotedText = referencedContent
    ? stripAIMessageMarker(referencedContent)
    : null;

  return {
    isReplyToAIMessage: true,
    quotedText: quotedText ? `Mensaje previo del bot:\n${quotedText}` : null,
  };
}

async function fetchReferencedMessage(
  client: any,
  messageId: string,
  channelId: string,
) {
  try {
    return await client.messages.fetch(messageId, channelId);
  } catch {
    return null;
  }
}

function stripBotMention(content: string, botId: string): string {
  if (!content) return "";
  const patterns = [`<@${botId}>`, `<@!${botId}>`];
  let out = content;
  for (const pattern of patterns) {
    out = out.split(pattern).join("");
  }
  return out;
}

