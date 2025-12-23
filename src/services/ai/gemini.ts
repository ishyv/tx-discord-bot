/**
 * Motivacion: encapsular la integracion con Gemini (Google GenAI) detras de la interfaz comun.
 *
 * Idea/concepto: expone `geminiProvider` (adapter) y `callGeminiAI` (compatibilidad)
 * para que el resto del bot no dependa de detalles del SDK de Google.
 *
 * Alcance: construye requests, llama al SDK y normaliza la respuesta.
 */
import {
  type Content,
  type GenerateContentParameters,
  type GenerateContentResponse,
  FinishReason,
  GoogleGenAI,
  Modality,
} from "@google/genai";
import { BOT_PROMPT, SAFETY_SETTINGS } from "@/constants/ai";
import type { Message } from "@/utils/userMemory";
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_NO_API_RESPONSE,
  DEFAULT_PROVIDER_ID,
  DEFAULT_TEMPERATURE,
  DEFAULT_TOP_K,
  DEFAULT_TOP_P,
  GEMINI_MODELS,
  SAFETY_BLOCK_MESSAGE,
} from "./constants";
import type { AIProvider, AIRequestOptions, AIResponse } from "./types";
import { buildAIResponse } from "./response";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.warn("[ai-service] GEMINI_API_KEY not set - AI features will return default responses");
}

const genAI = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
});

const DEFAULT_RESPONSE_MODALITIES = [Modality.TEXT];

type GeminiOptions = Omit<GenerateContentParameters, "contents">;

export const geminiProvider: AIProvider = {
  id: DEFAULT_PROVIDER_ID,
  label: "Gemini",
  defaultModel: DEFAULT_GEMINI_MODEL,
  models: GEMINI_MODELS,
  generate: async (messages, options) => callGeminiModel(messages, options),
};

export const callGeminiAI = async (
  messages: Message[],
  options?: AIRequestOptions,
): Promise<AIResponse> => callGeminiModel(messages, options);

function buildGeminiOptions(options?: AIRequestOptions): GeminiOptions {
  return {
    model: options?.model ?? DEFAULT_GEMINI_MODEL,
    config: {
      safetySettings: SAFETY_SETTINGS,
      candidateCount: 1,
      maxOutputTokens: options?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
      topK: options?.topK ?? DEFAULT_TOP_K,
      topP: options?.topP ?? DEFAULT_TOP_P,
      responseModalities:
        options?.responseModalities ?? DEFAULT_RESPONSE_MODALITIES,
    },
  };
}

async function callGeminiModel(
  messages: Message[],
  options?: AIRequestOptions,
): Promise<AIResponse> {
  let contents: Content[] = [
    {
      role: "user",
      parts: [{ text: BOT_PROMPT }],
    },
  ];

  contents = contents.concat(
    messages.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.content }],
    })),
  );

  const params = { contents, ...buildGeminiOptions(options) };

  try {
    const response = await genAI.models.generateContent(params);
    return parseGeminiResponse(response, {
      providerId: DEFAULT_PROVIDER_ID,
      model: params.model,
    });
  } catch (error) {
    console.error("[callGeminiAI] Error:", error);
    return buildAIResponse({
      providerId: DEFAULT_PROVIDER_ID,
      model: params.model,
      rawText: DEFAULT_NO_API_RESPONSE,
    });
  }
}

function parseGeminiResponse(
  response: GenerateContentResponse,
  metaInput: { providerId: typeof DEFAULT_PROVIDER_ID; model: string },
): AIResponse {
  let text = "";
  let image: Buffer | undefined;

  const candidates = response?.candidates ?? [];
  const candidate = candidates[0];
  const finishReason = candidate?.finishReason;
  const tokenCount = candidate?.tokenCount;
  const promptFeedback = response?.promptFeedback;
  const usage = response?.usageMetadata;

  if (!candidate?.content?.parts?.length) {
    if (promptFeedback?.blockReason || finishReason === FinishReason.SAFETY) {
      return buildAIResponse({
        providerId: metaInput.providerId,
        model: metaInput.model,
        rawText: SAFETY_BLOCK_MESSAGE,
        finishReason,
        tokenCount,
        usage,
        promptFeedback,
      });
    }

    return buildAIResponse({
      providerId: metaInput.providerId,
      model: metaInput.model,
      rawText: DEFAULT_NO_API_RESPONSE,
      finishReason,
      tokenCount,
      usage,
      promptFeedback,
    });
  }

  for (const part of candidate.content?.parts ?? []) {
    if ("text" in part && typeof part.text === "string") {
      text += part.text;
    } else if (part?.inlineData?.mimeType && part.inlineData.data) {
      image = Buffer.from(part.inlineData.data, "base64");
    }
  }

  return buildAIResponse({
    providerId: metaInput.providerId,
    model: metaInput.model,
    rawText: text,
    finishReason,
    tokenCount,
    usage,
    promptFeedback,
    image,
  });
}
