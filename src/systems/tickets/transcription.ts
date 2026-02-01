/**
 * HTML transcription generator for ticket channels.
 *
 * Context: Used by the close button to attach history to the logs channel
 * before deleting the ticket. Best-effort: if it fails, the closure continues.
 * Dependencies: Seyfert message API (manual pagination) and `Buffer`.
 * Invariants: Traverses messages in chunks of 100 backwards until exhausted; sorts
 * by ascending timestamp before rendering; only serializes text content
 * (no attachments or rich embeds).
 * Gotchas: Can be expensive in large channels; no internal rate-limit. If the
 * channel is deleted during reading, partial transcription is returned.
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
 * Generates an HTML transcription of a ticket channel.
 *
 * Parameters: `client` with read permissions; target `channelId`.
 * Returns: `Buffer` with HTML ready to attach.
 * Side effects: multiple calls to `messages.list` paginating 100 at a time.
 * Invariants: sorts by timestamp before rendering; escapes HTML to prevent
 * injection; omits attachments/embeds.
 * Gotchas: very long channels => time/memory; no message cap.
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
    <title>Ticket Transcription</title>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; }
        .message { margin-bottom: 15px; padding: 10px; background-color: #fff; border-radius: 5px; }    
        .author { font-weight: bold; }
        .timestamp { color: #888; font-size: 0.9em; }
        .content { margin-top: 5px; white-space: pre-wrap; word-break: break-word; }
    </style>
</head>
<body>
    <h1>Ticket Transcription</h1>
    ${messages
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
      .map((msg) => {
        const author = escapeHtml(msg.author?.username || "Unknown");
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
