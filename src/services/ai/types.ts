/**
 * Motivacion: tipar el sistema de IA de forma consistente entre proveedores.
 *
 * Idea/concepto: define contratos minimos (Provider, RequestOptions, Response) que
 * permiten intercambiar proveedores sin tocar el codigo consumidor.
 *
 * Alcance: solo tipos/interfaces; no contiene implementaciones ni side-effects.
 */
import type { FinishReason, GenerateContentResponse, Modality } from "@google/genai";
import type { Message } from "@/utils/userMemory";
import type { AIProviderId } from "./constants";

export type OpenAIUsageMetadata = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type AIUsageMetadata =
  | GenerateContentResponse["usageMetadata"]
  | OpenAIUsageMetadata;
export type AIPromptFeedback = GenerateContentResponse["promptFeedback"];

export interface AIResponseMeta {
  providerId: AIProviderId;
  model: string;
  finishReason?: FinishReason;
  tokenCount?: number;
  usage?: AIUsageMetadata;
  promptFeedback?: AIPromptFeedback;
  rawText?: string;
}

export interface AIResponse {
  text: string;
  image?: Buffer;
  meta?: AIResponseMeta;
}

export interface AIRequestOptions {
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  responseModalities?: Modality[];
}

export interface AIProvider {
  id: AIProviderId;
  label: string;
  defaultModel: string;
  models: readonly string[];
  generate(messages: Message[], options?: AIRequestOptions): Promise<AIResponse>;
}
