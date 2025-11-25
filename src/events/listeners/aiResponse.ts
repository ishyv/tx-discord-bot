/**
 * Motivación: encapsular la reacción al evento "ai Response" para mantener la lógica en un módulo autocontenido.
 *
 * Idea/concepto: se suscribe a los hooks correspondientes y coordina servicios o sistemas que deben ejecutarse.
 *
 * Alcance: orquesta el flujo específico del listener; no define el hook ni registra el evento base.
 */
import { onMessageCreate } from "@/events/hooks/messageCreate";
import { processMessage } from "@/services/ai";
import { sendPaginatedMessages } from "@/utils/messages";

/**
 * Listener que responde menciones al bot utilizando el servicio de IA.
 */
onMessageCreate(async (message, client) => {
  const { author, content } = message;

  if (author?.bot) {
    return;
  }

  // Si el bot no fue mencionado directamente, no responder (lógica consolidada abajo)

  const wasMentioned = message.mentions.users.find((user) => user.id === client.applicationId);
  const shouldReply =
    Boolean(wasMentioned) ||
    (message.referencedMessage?.author?.id === client.applicationId);

  if (!shouldReply) {
    return;
  }

  const response = await processMessage({
    userId: author.id,
    message: content,
  });

  if (response.image) {
    const file = {
      filename: "sushi.png",
      data: response.image,
    };

    await message.reply({ content: response.text, files: [file] });
    return;
  }

  await sendPaginatedMessages(client, message, response.text, true);
});
