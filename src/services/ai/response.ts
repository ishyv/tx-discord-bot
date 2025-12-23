/**
 * Motivacion: estandarizar la forma en que se normaliza y devuelve la respuesta de IA.
 *
 * Idea/concepto: todos los providers devuelven `rawText` (sin "notas") y `text`
 * (con la nota de truncado cuando aplica), y emiten logs consistentes segun finishReason.
 *
 * Alcance: helpers puros (sin red); el logging aqui es diagnostico.
 */
import { FinishReason } from "@google/genai";
import { DEFAULT_NO_API_RESPONSE, TRUNCATION_NOTICE } from "./constants";
import type { AIProviderId } from "./constants";
import type { AIPromptFeedback, AIResponse, AIUsageMetadata } from "./types";

function normalizeRawText(value?: string | null): string {
  const trimmed = (value ?? "").trim();
  return trimmed || DEFAULT_NO_API_RESPONSE;
}

export function buildAIResponse(input: {
  providerId: AIProviderId;
  model: string;
  rawText?: string | null;
  finishReason?: FinishReason;
  tokenCount?: number;
  usage?: AIUsageMetadata;
  promptFeedback?: AIPromptFeedback;
  image?: Buffer;
}): AIResponse {
  const normalized = normalizeRawText(input.rawText);
  let text = normalized;

  if (
    input.finishReason === FinishReason.MAX_TOKENS &&
    normalized !== DEFAULT_NO_API_RESPONSE
  ) {
    text = `${normalized}\n\n${TRUNCATION_NOTICE}`;
  }

  if (input.finishReason && input.finishReason !== FinishReason.STOP) {
    console.warn("[ai-service] Non-stop finish reason", {
      providerId: input.providerId,
      model: input.model,
      finishReason: input.finishReason,
      tokenCount: input.tokenCount,
      usage: input.usage,
      promptFeedback: input.promptFeedback,
    });
  }

  return {
    text,
    image: input.image,
    meta: {
      providerId: input.providerId,
      model: input.model,
      finishReason: input.finishReason,
      tokenCount: input.tokenCount,
      usage: input.usage,
      promptFeedback: input.promptFeedback,
      rawText: normalized,
    },
  };
}
