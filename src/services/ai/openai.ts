/**
 * Motivacion: encapsular la integracion con OpenAI detras de la interfaz comun.
 *
 * Idea/concepto: usa el SDK oficial (`openai`) para construir requests tipados,
 * manejar timeouts/reintentos del cliente y normalizar respuestas al formato interno.
 *
 * Alcance: construye requests, llama al SDK y normaliza la respuesta.
 */
import OpenAI from "openai";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from "openai/resources/chat/completions";
import { BOT_PROMPT } from "@/constants/ai";
import type { Message } from "@/utils/userMemory";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_NO_API_RESPONSE,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_TOP_P,
  OPENAI_MODELS,
  OPENAI_REQUEST_TIMEOUT_MS,
} from "./constants";
import type {
  AIProvider,
  AIRequestOptions,
  AIResponse,
  OpenAIUsageMetadata,
} from "./types";
import { buildAIResponse } from "./response";
import { FinishReason } from "@google/genai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.warn("[ai-service] OPENAI_API_KEY not set - OpenAI provider will return default responses");
}

const openaiClient = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY, timeout: OPENAI_REQUEST_TIMEOUT_MS })
  : null;

type OpenAITextMessage =
  | ChatCompletionSystemMessageParam
  | ChatCompletionUserMessageParam
  | ChatCompletionAssistantMessageParam;

type OpenAIRole = OpenAITextMessage["role"];

export const openaiProvider: AIProvider = {
  id: "openai",
  label: "OpenAI",
  defaultModel: DEFAULT_OPENAI_MODEL,
  models: OPENAI_MODELS,
  generate: async (messages, options) => callOpenAIModel(messages, options),
};

function mapOpenAIRole(role: string): OpenAIRole {
  if (role === "model" || role === "assistant") return "assistant";
  if (role === "system") return "system";
  return "user";
}

function mapOpenAIFinishReason(value?: string | null): FinishReason | undefined {
  switch (value) {
    case "stop":
      return FinishReason.STOP;
    case "length":
      return FinishReason.MAX_TOKENS;
    case "content_filter":
      return FinishReason.SAFETY;
    default:
      return value ? FinishReason.OTHER : undefined;
  }
}

async function callOpenAIModel(
  messages: Message[],
  options?: AIRequestOptions,
): Promise<AIResponse> {
  const model = options?.model ?? DEFAULT_OPENAI_MODEL;
  if (!openaiClient) {
    return buildAIResponse({
      providerId: "openai",
      model,
      rawText: DEFAULT_NO_API_RESPONSE,
    });
  }

  const openaiMessages: OpenAITextMessage[] = [
    { role: "system", content: BOT_PROMPT },
    ...messages.map((msg) => ({
      role: mapOpenAIRole(msg.role),
      content: msg.content,
    })),
  ];

  const payload: ChatCompletionCreateParamsNonStreaming = {
    model,
    messages: openaiMessages,
    max_tokens: options?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
    top_p: options?.topP ?? DEFAULT_TOP_P,
  };

  try {
    const completion = await openaiClient.chat.completions.create(payload);
    const choice = completion.choices?.[0];
    const finishReason = mapOpenAIFinishReason(choice?.finish_reason);
    const rawText = choice?.message?.content ?? "";

    return buildAIResponse({
      providerId: "openai",
      model,
      rawText,
      finishReason,
      usage: completion.usage as OpenAIUsageMetadata | undefined,
    });
  } catch (error) {
    console.error("[ai-service] OpenAI request failed", error);
    return buildAIResponse({
      providerId: "openai",
      model,
      rawText: DEFAULT_NO_API_RESPONSE,
    });
  }
}
