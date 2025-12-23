/**
 * Motivacion: encapsular las llamadas a Gemini y la gestion de memoria contextual.
 *
 * Idea/concepto: este archivo es el "orquestador" del sistema de IA:
 * - resuelve configuracion por guild (provider/model) via `configStore`
 * - mantiene memoria efimera por usuario (userMemory) para conversaciones
 * - expone una API estable consumida por listeners/comandos (`processMessage`, `generateForGuild`)
 *
 * Los detalles de cada proveedor viven en modulos dedicados:
 * - `src/ai/gemini.ts`
 * - `src/ai/openai.ts`
 * y los contratos/constantes compartidas en:
 * - `src/ai/types.ts`
 * - `src/ai/constants.ts`
 * - `src/ai/response.ts`
 *
 * Alcance: produce texto (o imagenes) a partir de la API; no decide flujos de negocio.
 */
import { configStore, ConfigurableModule } from "@/configuration";
import { getContextMessages } from "@/utils/getContext";
import { type Message, userMemory } from "@/utils/userMemory";
import { DEFAULT_GEMINI_MODEL, DEFAULT_PROVIDER_ID } from "./constants";
import type { AIProvider, AIRequestOptions, AIResponse } from "./types";
import type { AIProviderId } from "./constants";
import { geminiProvider, callGeminiAI } from "./gemini";
import { openaiProvider } from "./openai";

export * from "./constants";
export * from "./types";
export { callGeminiAI };

interface ProcessMessageOptions {
  userId: string;
  message: string;
  quotedText?: string;
  guildId?: string | null;
}

const providers: Record<AIProviderId, AIProvider> = {
  gemini: geminiProvider,
  openai: openaiProvider,
};

/**
 * Entrada "conversacional" por usuario.
 *
 * - Fusiona (opcional) contexto citado + memoria efimera + el mensaje actual
 * - Ejecuta `generateForGuild` (respeta provider/model configurado)
 * - Persiste la memoria usando `meta.rawText` para evitar guardar la nota de truncado
 */
export const processMessage = async ({
  userId,
  message,
  quotedText,
  guildId,
}: ProcessMessageOptions): Promise<AIResponse> => {
  try {
    const memory = userMemory.get(userId);

    const context = quotedText ? await getContextMessages(quotedText) : [];

    const messages: Message[] = [
      ...context,
      ...memory,
      { role: "user", content: message },
    ];

    const aiResponse = await generateForGuild({
      guildId,
      messages,
    });

    const memoryText = aiResponse.meta?.rawText ?? aiResponse.text;
    userMemory.append(userId, { role: "user", content: message });
    userMemory.append(userId, { role: "model", content: memoryText });

    return aiResponse;
  } catch (error) {
    console.error("[processMessage] Error:", error);
    return {
      text: "Ocurrio un error procesando tu mensaje.",
    };
  }
};

/** Devuelve los providers disponibles (id/label) para autocomplete/UX. */
export function listProviders(): Array<{ id: AIProviderId; label: string }> {
  return Object.values(providers).map((provider) => ({
    id: provider.id,
    label: provider.label,
  }));
}

/** Lista modelos conocidos para un provider. */
export function listModelsForProvider(providerId: string): string[] {
  if (!isProviderAvailable(providerId)) return [];
  return [...providers[providerId].models];
}

/** Provider default (usado cuando no hay config por guild o la config es invalida). */
export function getDefaultProviderId(): AIProviderId {
  return DEFAULT_PROVIDER_ID;
}

/** Modelo default por provider (usado cuando el modelo guardado no es valido). */
export function getDefaultModelForProvider(providerId: string): string {
  if (!isProviderAvailable(providerId)) return DEFAULT_GEMINI_MODEL;
  return providers[providerId].defaultModel;
}

/** Type guard para providers soportados. */
export function isProviderAvailable(providerId: string): providerId is AIProviderId {
  return providerId in providers;
}

/** Verifica si el modelo existe dentro del provider dado. */
export function isModelAvailableForProvider(providerId: string, model: string): boolean {
  return listModelsForProvider(providerId).includes(model);
}

/**
 * Entrada generica para generar texto segun configuracion de guild.
 *
 * Uso tipico: listeners (forumAutoReply) y comandos (joke) construyen un prompt y llaman a esto.
 */
export async function generateForGuild(options: {
  guildId?: string | null;
  messages: Message[];
  overrides?: AIRequestOptions;
}): Promise<AIResponse> {
  const resolved = await resolveProviderConfig(
    options.guildId,
    options.overrides?.model,
  );

  const response = await resolved.provider.generate(options.messages, {
    ...options.overrides,
    model: resolved.model,
  });

  return {
    ...response,
    meta: {
      providerId: resolved.providerId,
      model: resolved.model,
      ...response.meta,
    },
  };
}

async function resolveProviderConfig(
  guildId: string | null | undefined,
  overrideModel?: string,
): Promise<{ providerId: AIProviderId; provider: AIProvider; model: string }> {
  const fallback = {
    provider: DEFAULT_PROVIDER_ID,
    model: DEFAULT_GEMINI_MODEL,
  };

  let config = fallback;
  if (guildId) {
    try {
      const stored = await configStore.get(guildId, ConfigurableModule.AI);
      config = {
        provider: stored.provider ?? fallback.provider,
        model: stored.model ?? fallback.model,
      };
    } catch (error) {
      console.warn("[ai-service] Failed to read AI config, using defaults", {
        error,
        guildId,
      });
    }
  }

  const providerId = isProviderAvailable(config.provider)
    ? config.provider
    : DEFAULT_PROVIDER_ID;
  const provider = providers[providerId];

  if (config.provider !== providerId) {
    console.warn("[ai-service] Unknown provider, falling back", {
      provider: config.provider,
      fallback: providerId,
      guildId,
    });
  }

  const requestedModel = overrideModel ?? config.model;
  const model = isModelAvailableForProvider(providerId, requestedModel)
    ? requestedModel
    : provider.defaultModel;

  if (requestedModel !== model) {
    console.warn("[ai-service] Invalid model for provider, using default", {
      providerId,
      requestedModel,
      fallback: model,
      guildId,
    });
  }

  return { providerId, provider, model };
}
