/**
 * Motivación: implementar el sistema de TOPs (estadísticas periódicas) en un módulo autocontenido.
 *
 * Idea/concepto: registrar actividad relevante (mensajes/emojis/reputación) en la ventana activa,
 * evaluar cuándo toca enviar el reporte y persistir un historial inmutable de cada ciclo.
 *
 * Alcance: lógica de dominio y orquestación (persistencia, formateo y scheduler). Los comandos
 * solo deberían delegar en este módulo para configurar o forzar envíos.
 */
import { Embed, type UsingClient } from "seyfert";

import {
  bumpChannelCount,
  bumpEmojiCounts,
  bumpReputationDelta,
  findDueWindows,
  getTopWindow,
  persistTopReport,
  rotateWindowAfterReport,
  updateTopConfig,
  type TopWindow,
} from "@/db/repositories";
import { format as formatMs } from "@/utils/ms";
import {
  fetchStoredChannel,
  isUnknownChannelError,
} from "@/utils/channelGuard";

const SWEEP_INTERVAL_MS = 60_000;
const inFlight = new Set<string>();
let sweepTimer: NodeJS.Timeout | null = null;

type MessageLike = {
  guildId?: string | null;
  channelId?: string | null;
  channel?: { id?: string | null };
  content?: string | null;
  author?: { bot?: boolean | null } | null;
  member?: { guildId?: string | null } | null;
};

const toGuildId = (payload: MessageLike): string | null => {
  return (
    (payload.guildId as string | undefined) ??
    (payload.member?.guildId as string | undefined) ??
    null
  );
};

const toChannelId = (payload: MessageLike): string | null => {
  return (
    (payload.channelId as string | undefined) ??
    (payload.channel?.id as string | undefined) ??
    null
  );
};

const CUSTOM_EMOJI_REGEX = /<a?:[a-zA-Z0-9_~-]+:(\d+)>/g;
const UNICODE_EMOJI_REGEX =
  /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;

const extractEmojiOccurrences = (
  content: string | null | undefined,
): string[] => {
  if (!content) return [];
  const result: string[] = [];

  while (true) {
    const customMatch = CUSTOM_EMOJI_REGEX.exec(content);
    if (!customMatch) break;
    result.push(customMatch[0]);
  }

  while (true) {
    const unicodeMatch = UNICODE_EMOJI_REGEX.exec(content);
    if (!unicodeMatch) break;
    result.push(unicodeMatch[0]);
  }

  return result;
};

const buildEmojiCountMap = (emojis: string[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const emoji of emojis) {
    counts[emoji] = (counts[emoji] ?? 0) + 1;
  }
  return counts;
};

const pickTopEntries = (
  map: Record<string, number>,
  size: number,
  filter?: (entry: [string, number]) => boolean,
): Array<[string, number]> => {
  const entries = Object.entries(map ?? {});
  const filtered = filter ? entries.filter(filter) : entries;

  return filtered.sort((a, b) => b[1] - a[1]).slice(0, Math.max(1, size));
};

const formatTopLines = (
  entries: Array<[string, number]>,
  formatter: (entry: [string, number], index: number) => string,
  emptyFallback: string,
): string => {
  if (!entries.length) return emptyFallback;
  return entries.map((entry, index) => formatter(entry, index)).join("\n");
};

const buildReportEmbed = (
  window: TopWindow,
  periodEnd: Date,
  topSize: number,
): Embed => {
  const periodStart = window.windowStartedAt;

  const topEmojis = pickTopEntries(window.emojiCounts ?? {}, topSize);
  const topChannels = pickTopEntries(window.channelCounts ?? {}, topSize);
  const topReputation = pickTopEntries(
    window.reputationDeltas ?? {},
    topSize,
    ([, delta]) => delta > 0,
  );

  const emojiLines = formatTopLines(
    topEmojis,
    ([emoji, count], index) => `**${index + 1}.** ${emoji} — ${count}`,
    "Sin usos registrados en el periodo.",
  );

  const channelLines = formatTopLines(
    topChannels,
    ([channelId, count], index) =>
      `**${index + 1}.** <#${channelId}> — ${count}`,
    "Sin mensajes en los canales monitoreados.",
  );

  const reputationLines = formatTopLines(
    topReputation,
    ([userId, delta], index) =>
      `**${index + 1}.** <@${userId}> — +${delta} rep`,
    "No one gained reputation in this period.",
  );

  const embed = new Embed()
    .setTitle("📊 Reporte de TOPs")
    .setDescription(
      [
        `Ventana: <t:${Math.floor(periodStart.getTime() / 1000)}:f>`,
        `Hasta: <t:${Math.floor(periodEnd.getTime() / 1000)}:f>`,
        `Intervalo configurado: ${formatMs(window.intervalMs, true)}`,
      ].join("\n"),
    )
    .addFields(
      { name: "😊 Most used emojis", value: emojiLines },
      { name: "🗨️ Most active channels", value: channelLines },
      { name: "⭐ Users with most reputation gained", value: reputationLines },
    )
    .setTimestamp(periodEnd);

  return embed;
};

const isActive = (window: TopWindow | null): window is TopWindow => {
  if (!window) return false;
  return Boolean(window.intervalMs > 0 && window.channelId != null);
};

async function sendReport(
  client: UsingClient,
  window: TopWindow,
  now: Date,
): Promise<boolean> {
  const resolved = await fetchStoredChannel(
    client,
    window.channelId,
    async () => {
      await updateTopConfig(window.guildId, { channelId: null });
    },
  );
  if (!resolved.channelId || !resolved.channel) return false;
  if (!resolved.channel.isTextGuild()) {
    return false;
  }
  const topSize = Number.isFinite(window.topSize)
    ? Math.max(1, window.topSize)
    : 10;

  const embed = buildReportEmbed(window, now, topSize);
  try {
    await client.messages.write(resolved.channelId, {
      embeds: [embed],
      content:
        "Activity summary for the current period. Counters reset now.",
    });
    return true;
  } catch (error) {
    if (isUnknownChannelError(error)) {
      await updateTopConfig(window.guildId, { channelId: null });
    }
    client.logger?.error?.("[tops] failed to send report", {
      error,
      guildId: window.guildId,
      channelId: window.channelId,
    });
    return false;
  }
}

const hasIntervalElapsed = (window: TopWindow, now: Date): boolean => {
  const start =
    window.windowStartedAt?.getTime?.() ??
    new Date(window.windowStartedAt).getTime();
  const dueAt = start + Number(window.intervalMs ?? 0);
  return now.getTime() >= dueAt;
};

async function emitIfDue(
  client: UsingClient,
  guildId: string,
  preloaded?: TopWindow | null,
): Promise<void> {
  if (inFlight.has(guildId)) return;
  const now = new Date();

  const window = preloaded ?? (await getTopWindow(guildId));
  if (!isActive(window)) return;
  if (!hasIntervalElapsed(window, now)) return;

  inFlight.add(guildId);
  try {
    const delivered = await sendReport(client, window, now);
    if (!delivered) return;

    try {
      await persistTopReport({
        guildId,
        periodStart: window.windowStartedAt,
        periodEnd: now,
        intervalMs: window.intervalMs,
        emojiCounts: window.emojiCounts,
        channelCounts: window.channelCounts,
        reputationDeltas: window.reputationDeltas,
        metadata: {
          topSize: window.topSize,
        },
      });
    } catch (error) {
      client.logger?.error?.(
        "[tops] failed to save report history",
        {
          error,
          guildId,
        },
      );
    }

    await rotateWindowAfterReport(guildId, now);
  } finally {
    inFlight.delete(guildId);
  }
}

async function sweep(client: UsingClient): Promise<void> {
  try {
    const due = await findDueWindows();
    if (!due.length) return;

    for (const window of due) {
      await emitIfDue(client, window.guildId, window);
    }
  } catch (error) {
    client.logger?.error?.("[tops] sweep fallo", { error });
  }
}

/**
 * Registra mensajes para contar emojis y actividad de canales.
 */
export async function recordMessageActivity(
  client: UsingClient,
  message: MessageLike,
): Promise<void> {
  if (message.author?.bot) return;
  const guildId = toGuildId(message);
  if (!guildId) return;

  const window = await getTopWindow(guildId);
  if (!isActive(window)) return;

  const channelId = toChannelId(message);
  if (channelId) {
    await bumpChannelCount(guildId, channelId, 1);
  }

  const emojiCounts = buildEmojiCountMap(
    extractEmojiOccurrences(message.content ?? ""),
  );
  if (Object.keys(emojiCounts).length) {
    await bumpEmojiCounts(guildId, emojiCounts);
  }

  await emitIfDue(client, guildId, window);
}

/**
 * Registra un cambio de reputación neta para el TOP activo.
 */
export async function recordReputationChange(
  client: UsingClient,
  guildId: string,
  userId: string,
  delta: number,
): Promise<void> {
  if (!guildId || !userId || !Number.isFinite(delta) || delta === 0) return;

  const window = await getTopWindow(guildId);
  if (!isActive(window)) return;

  await bumpReputationDelta(guildId, userId, delta);
  await emitIfDue(client, guildId, window);
}

/**
 * Arranca el scheduler que barre periódicamente los guilds con intervalos vencidos.
 */
export function startTopsScheduler(client: UsingClient): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    void sweep(client);
  }, SWEEP_INTERVAL_MS);
  (sweepTimer as any)?.unref?.();
}

/**
 * Detiene el scheduler (principalmente útil en tests o al apagar el bot).
 */
export function stopTopsScheduler(): void {
  if (!sweepTimer) return;
  clearInterval(sweepTimer);
  sweepTimer = null;
}

