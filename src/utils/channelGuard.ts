/**
 * Helpers para fetch de canales tolerante a rutas rotas.
 *
 * Propósito: normalizar snowflakes, distinguir canal desconocido (10003) y
 * permitir callbacks de saneamiento (`onMissing`) cuando se detectan referencias
 * corruptas.
 * Dependencias: `normalizeSnowflake`, API de canales de Seyfert.
 * Invariantes: nunca lanza; siempre retorna `{channel, channelId, missing}` con
 * `missing` verdadero cuando Discord responde 10003.
 * Gotchas: `onMissing` se ejecuta también si el snowflake no es válido; callers
 * deben ser idempotentes.
 */
import type { UsingClient } from "seyfert";
import { normalizeSnowflake } from "@/utils/snowflake";

type FetchedChannel = Awaited<ReturnType<UsingClient["channels"]["fetch"]>>;

export type ChannelFetchResult = {
  channel: FetchedChannel | null;
  channelId: string | null;
  missing: boolean;
  error?: unknown;
};

const getDiscordErrorCode = (error: unknown): number | null => {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  const code = record.code;
  if (typeof code === "number") return code;
  if (typeof code === "string" && code.trim()) {
    const parsed = Number(code);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const isUnknownChannelError = (error: unknown): boolean => {
  return getDiscordErrorCode(error) === 10003;
};

/**
 * Obtiene un canal configurado manejando snowflakes inválidos y 10003.
 *
 * Parámetros: `channelId` cualquier valor; `onMissing` opcional para limpiar
 * rutas. Normaliza a string, intenta fetch y marca `missing` en error 10003 o
 * IDs inválidos.
 * Retorno: `{ channel, channelId, missing, error? }` sin lanzar.
 * Side effects: ejecuta `onMissing` cuando detecta ruta rota.
 * Gotchas: si el canal existe pero no es de texto/voz, se retorna igualmente;
 * los callers deben validar el tipo.
 */
export async function fetchStoredChannel(
  client: UsingClient,
  channelId: unknown,
  onMissing?: () => Promise<void> | void,
): Promise<ChannelFetchResult> {
  if (channelId == null) {
    return { channel: null, channelId: null, missing: false };
  }

  const normalized = normalizeSnowflake(channelId);
  if (!normalized) {
    if (onMissing) {
      await onMissing();
    }
    return { channel: null, channelId: null, missing: true };
  }

  try {
    const channel = await client.channels.fetch(normalized);
    if (!channel) {
      if (onMissing) {
        await onMissing();
      }
      return { channel: null, channelId: null, missing: true };
    }
    return { channel, channelId: normalized, missing: false };
  } catch (error) {
    const missing = isUnknownChannelError(error);
    if (missing && onMissing) {
      await onMissing();
    }
    return { channel: null, channelId: null, missing, error };
  }
}
