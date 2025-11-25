/**
 * Motivación: aportar utilidades (parsers) para construir la funcionalidad de autoroles sin duplicar parseo ni validación.
 *
 * Idea/concepto: define tipos, caché y validadores que consumen los sistemas y comandos de autorole.
 *
 * Alcance: piezas de infraestructura; no programan las reglas de asignación en sí mismas.
 */
/**
 * All text-to-trigger parsing lives here so slash commands and importers can
 * rely on a single truth for accepted syntax.  Keeping the parsing isolated
 * avoids subtle mismatches whenever we tweak autorole semantics.
 */

import type { APIEmoji } from "seyfert/lib/types";

import type {
  AutoRoleTrigger,
  MessageReactAnyTrigger,
  ReactSpecificTrigger,
  ReactedThresholdTrigger,
  ReputationThresholdTrigger,
  AntiquityThresholdTrigger,
} from "./types";
import { isValidThresholdCount, normalizeSnowflake } from "./validation";
import { parse as parseMs } from "@/utils/ms";

const CANON_MESSAGE_REACT = "onmessagereactany";
const CANON_REACT_SPECIFIC = "onreactspecific";
const CANON_REACTION_THRESHOLD = "onauthorreactionthreshold";
const CANON_REPUTATION_THRESHOLD = "onreputationatleast";
const CANON_ANTIQUITY_THRESHOLD = "onantiquityatleast";

const CUSTOM_EMOJI_PATTERN = /^<a?:[a-zA-Z0-9_~]+:(\d{2,})>$/;
const RAW_ID_PATTERN = /^\d{16,}$/;

export class TriggerParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TriggerParseError";
  }
}

export function parseTrigger(input: string): AutoRoleTrigger {
  if (!input || typeof input !== "string") {
    throw new TriggerParseError("El trigger debe ser una cadena no vacia.");
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new TriggerParseError("El trigger no puede estar vacio.");
  }

  const [headRaw, ...rest] = trimmed.split(/\s+/);
  const head = normalizeToken(headRaw);

  if (head === CANON_MESSAGE_REACT) {
    return expectMessageReactAny(rest);
  }

  if (head === CANON_REACTION_THRESHOLD) {
    return expectReactedThreshold(rest);
  }

  if (head === CANON_REACT_SPECIFIC) {
    return expectReactSpecific(rest);
  }

  if (head === CANON_REPUTATION_THRESHOLD) {
    return expectReputationThreshold(rest);
  }

  if (head === CANON_ANTIQUITY_THRESHOLD) {
    return expectAntiquityThreshold(rest);
  }

  throw new TriggerParseError(
    `Trigger no soportado: "${headRaw}". Usa onMessageReactAny, onReactSpecific, onAuthorReactionThreshold, onReputationAtLeast u onAntiquityAtLeast.`,
  );
}

function expectMessageReactAny(args: string[]): MessageReactAnyTrigger {
  if (args.length !== 0) {
    throw new TriggerParseError(
      "El trigger 'onMessageReactAny' no acepta argumentos.",
    );
  }
  return { type: "MESSAGE_REACT_ANY", args: {} };
}

function expectReactSpecific(args: string[]): ReactSpecificTrigger {
  if (args.length !== 2) {
    throw new TriggerParseError(
      "El trigger 'onReactSpecific' requiere un ID de mensaje y un emoji.",
    );
  }

  const [messageIdRaw, emojiRaw] = args;
  const messageId = normalizeSnowflake(messageIdRaw);
  if (!messageId) {
    throw new TriggerParseError(
      "El trigger 'onReactSpecific' requiere un ID de mensaje de Discord valido.",
    );
  }

  const emojiKey = normalizeEmojiKey(emojiRaw);
  if (!emojiKey) {
    throw new TriggerParseError(
      "El trigger 'onReactSpecific' requiere un emoji valido.",
    );
  }

  return {
    type: "REACT_SPECIFIC",
    args: {
      messageId,
      emojiKey,
    },
  };
}

function expectReactedThreshold(args: string[]): ReactedThresholdTrigger {
  if (args.length !== 2) {
    throw new TriggerParseError(
      "El trigger 'onAuthorReactionThreshold' requiere un emoji y un numero.",
    );
  }

  const [emojiRaw, countRaw] = args;
  const emojiKey = normalizeEmojiKey(emojiRaw);
  if (!emojiKey) {
    throw new TriggerParseError(
      "El trigger 'onAuthorReactionThreshold' requiere un emoji valido.",
    );
  }

  const count = Number.parseInt(countRaw, 10);
  if (!isValidThresholdCount(count)) {
    throw new TriggerParseError(
      "El trigger 'onAuthorReactionThreshold' requiere un conteo entre 1 y 1000.",
    );
  }

  return {
    type: "REACTED_THRESHOLD",
    args: {
      emojiKey,
      count,
    },
  };
}

function expectReputationThreshold(args: string[]): ReputationThresholdTrigger {
  if (args.length !== 1) {
    throw new TriggerParseError(
      "El trigger 'onReputationAtLeast' requiere un numero.",
    );
  }

  const value = Number.parseInt(args[0], 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new TriggerParseError(
      "El trigger 'onReputationAtLeast' requiere un entero mayor o igual a 0.",
    );
  }

  return {
    type: "REPUTATION_THRESHOLD",
    args: {
      minRep: value,
    },
  };
}

function expectAntiquityThreshold(args: string[]): AntiquityThresholdTrigger {
  if (args.length === 0) {
    throw new TriggerParseError(
      "El trigger 'onAntiquityAtLeast' requiere una duracion (ej: 1y 6m).",
    );
  }

  const raw = args.join(" ");
  const duration = parseDuration(raw);

  if (!duration || duration < 3600000) {
    // Minimum 1 hour
    throw new TriggerParseError(
      "El trigger 'onAntiquityAtLeast' requiere una duracion valida minima de 1 hora.",
    );
  }

  return {
    type: "ANTIQUITY_THRESHOLD",
    args: {
      durationMs: duration,
    },
  };
}

export function normalizeEmojiKey(emoji: APIEmoji | string | null): string {
  // We deliberately collapse the various emoji representations to a single key so
  // rule comparisons work regardless of whether an admin pasted the raw emoji,
  // the ID, or a structured object from Discord.
  if (!emoji) return "";

  if (typeof emoji === "object") {
    if (emoji.id) {
      return emoji.id;
    }
    if (emoji.name) {
      return emoji.name;
    }
    return "";
  }

  const trimmed = emoji.trim();
  if (!trimmed) return "";

  const customMatch = trimmed.match(CUSTOM_EMOJI_PATTERN);
  if (customMatch) {
    return customMatch[1];
  }

  if (RAW_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

export function parseDuration(raw?: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = parseMs(trimmed);
  if (!Number.isFinite(parsed) || parsed == null || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
}

export function isLiveRule(durationMs: number | null | undefined): boolean {
  return durationMs == null;
}

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/[_-\s]/g, "");
}
