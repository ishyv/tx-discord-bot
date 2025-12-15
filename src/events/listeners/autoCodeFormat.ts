/**
 * Motivación: reducir fricción cuando alguien pega código sin formatear.
 *
 * Problema previo (H2): el listener anterior registraba un `onMessageReactionAdd`
 * nuevo por cada mensaje recibido. Eso provoca acumulación de listeners en memoria
 * (si nadie reacciona) y habilita abuso (borrado de mensajes por terceros).
 *
 * Solución: un solo listener global de reacciones + una tabla en memoria con TTL
 * (messageId -> payload formateado). Solo el autor original puede disparar el
 * reemplazo mediante la reacción.
 */
import { toFencedBlock } from "@/modules/code-detection";
import { onMessageCreate } from "@/events/hooks/messageCreate";
import { onMessageReactionAdd } from "@/events/hooks/messageReaction";
import type { UsingClient } from "seyfert";

const EMOJI_CODE_DETECTED = "\u2728";
const PENDING_TTL_MS = 10 * 60_000;
const SWEEP_INTERVAL_MS = 60_000;
const MAX_PENDING = 1_000;

type ReactionPayload = {
  messageId: string;
  channelId: string;
  userId: string;
  emoji: { id: string | null; name: string | null };
  member?: { user: { bot?: boolean } };
};

type PendingFormat = {
  channelId: string;
  authorId: string;
  fenced: string;
  createdAt: number;
};

const pendingByMessageId = new Map<string, PendingFormat>();
let sweepTimer: NodeJS.Timeout | null = null;

function sweepExpired(now: number = Date.now()): void {
  for (const [messageId, entry] of pendingByMessageId) {
    if (now - entry.createdAt >= PENDING_TTL_MS) {
      pendingByMessageId.delete(messageId);
    }
  }
}

function ensureSweep(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => sweepExpired(), SWEEP_INTERVAL_MS);
  (sweepTimer as any)?.unref?.();
}

function pruneIfNeeded(): void {
  if (pendingByMessageId.size <= MAX_PENDING) return;
  const overflow = pendingByMessageId.size - MAX_PENDING;
  for (let i = 0; i < overflow; i++) {
    const oldestKey = pendingByMessageId.keys().next().value as
      | string
      | undefined;
    if (!oldestKey) break;
    pendingByMessageId.delete(oldestKey);
  }
}

onMessageReactionAdd(async (payload: ReactionPayload, client: UsingClient) => {
  if (payload.member?.user.bot === true) return;

  const emojiName = payload.emoji?.name ?? null;
  if (emojiName !== EMOJI_CODE_DETECTED) return;

  const pending = pendingByMessageId.get(payload.messageId);
  if (!pending) return;

  // Anti-abuso: solo el autor original puede disparar el reemplazo.
  if (payload.userId !== pending.authorId) return;

  // Consumir primero para idempotencia (evita dobles ejecuciones por carreras).
  pendingByMessageId.delete(payload.messageId);

  try {
    await client.messages.delete(payload.messageId, pending.channelId);
  } catch {
    // Si no podemos borrar (permisos), igual intentamos publicar el bloque formateado.
  }

  try {
    await client.messages.write(pending.channelId, { content: pending.fenced });
  } catch (error) {
    client.logger?.warn?.("[autoCodeFormat] no se pudo publicar el bloque", {
      error,
      channelId: pending.channelId,
      messageId: payload.messageId,
    });
  }
});

onMessageCreate(async (message) => {
  if (message.author?.bot) return;

  const fenced = toFencedBlock(message.content);
  if (!fenced) return;

  const channelId =
    (message as any).channelId ?? (message as any).channel?.id ?? null;
  if (!channelId) return;

  ensureSweep();
  sweepExpired();
  pruneIfNeeded();

  pendingByMessageId.set(message.id, {
    channelId,
    authorId: message.author.id,
    fenced,
    createdAt: Date.now(),
  });

  try {
    // UX: indica que se detectó código y habilita el “tap to format”.
    await message.react(EMOJI_CODE_DETECTED);
  } catch {
    // Si no podemos reaccionar (permisos), no dejamos el entry colgando.
    pendingByMessageId.delete(message.id);
  }
});
