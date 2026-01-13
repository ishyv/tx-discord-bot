/**
 * Generador de transcripciones HTML para canales de tickets.
 *
 * Encaje: usado por el botón de cierre para adjuntar historial al canal de logs
 * antes de borrar el ticket. Best-effort: si falla, el cierre sigue.
 * Dependencias: API de mensajes de Seyfert (paginado manual) y `Buffer`.
 * Invariantes: recorre mensajes en bloques de 100 hacia atrás hasta agotar; ordena
 * por timestamp ascendente antes de renderizar; solo serializa contenido de texto
 * (no adjuntos ni embeds ricos).
 * Gotchas: puede ser costoso en canales grandes; sin rate-limit interno. Si el
 * canal se borra durante la lectura, se devuelve la transcripción parcial.
 */
import type { UsingClient } from "seyfert";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Genera una transcripción HTML de un canal de ticket.
 *
 * Parámetros: `client` con permisos de lectura; `channelId` objetivo.
 * Retorno: `Buffer` con HTML listo para adjuntar.
 * Side effects: múltiples llamadas a `messages.list` paginando de 100 en 100.
 * Invariantes: ordena por timestamp antes de renderizar; escapa HTML para evitar
 * inyección; omite adjuntos/embeds.
 * Gotchas: canales muy largos => tiempo/memoria; no hay tope de mensajes.
 */
export async function create_transcription(
  client: UsingClient,
  channelId: string,
) {
  const messages = [];
  let before: string | undefined;

  while (true) {
    const batch = await client.messages.list(
      channelId,
      before ? { limit: 100, before } : { limit: 100 },
    );

    if (!batch.length) {
      break;
    }

    messages.push(...batch);

    if (batch.length < 100 || !batch[batch.length - 1]?.id) {
      break;
    }

    before = batch[batch.length - 1].id;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Transcripción de Ticket</title>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; }
        .message { margin-bottom: 15px; padding: 10px; background-color: #fff; border-radius: 5px; }    
        .author { font-weight: bold; }
        .timestamp { color: #888; font-size: 0.9em; }
        .content { margin-top: 5px; white-space: pre-wrap; word-break: break-word; }
    </style>
</head>
<body>
    <h1>Transcripción de Ticket</h1>
    ${messages
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
      .map((msg) => {
        const author = escapeHtml(msg.author?.username || "Desconocido");
        const timestamp = escapeHtml(
          new Date(msg.timestamp ?? 0).toLocaleString(),
        );
        const content = escapeHtml(msg.content || "");

        return `
    <div class="message">
        <div class="author">${author}</div>
        <div class="timestamp">${timestamp}</div>
        <div class="content">${content}</div>
    </div>
    `;
      })
      .join("")}
</body>
</html>`;

  // Return file buffer
  return Buffer.from(html, "utf-8");
}
