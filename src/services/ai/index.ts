/**
 * Motivation: Encapsulate calls to AI providers (Gemini, OpenAI) and contextual memory management.
 *
 * Idea/concept: This file is the "orchestrator" of the AI system:
 * - Resolves per-guild configuration (provider/model) via `configStore`
 * - Maintains ephemeral in-memory storage per user (userMemory) for conversations
 * - Exposes a stable API consumed by listeners/commands (`processMessage`, `generateForGuild`)
 *
 * Each provider's details live in dedicated modules:
 * - `src/ai/gemini.ts`
 * - `src/ai/openai.ts`
 * and the shared contracts/constants in:
 * - `src/ai/types.ts`
 * - `src/ai/constants.ts`
 * - `src/ai/response.ts`
 *
 * Scope: Produces text (or images) from the API; does not decide business flows.
 */
import { configStore, ConfigurableModule } from "@/configuration";
import { getContextMessages } from "@/utils/getContext";
import { type Message, userMemory } from "@/utils/userMemory";
import { DEFAULT_GEMINI_MODEL, DEFAULT_PROVIDER_ID } from "./constants";
import type { AIProvider, AIRequestOptions, AIResponse } from "./types";
import type { AIProviderId } from "./constants";
import { geminiProvider } from "./gemini";
import { openaiProvider } from "./openai";
import { aiRateLimiter } from "./rateLimiter";

export * from "./constants";
export * from "./types";
export { aiRateLimiter };

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
 * "Conversational" input per user.
 *
 * - Merges (optional) quoted context + ephemeral memory + the current message
 * - Executes `generateForGuild` (respects configured provider/model)
 * - Persists memory using `meta.rawText` to avoid saving the truncation note
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
      userId,
      messages,
    });

    const memoryText = aiResponse.meta?.rawText ?? aiResponse.text;
    userMemory.append(userId, { role: "user", content: message });
    userMemory.append(userId, { role: "model", content: memoryText });

    return aiResponse;
  } catch (error) {
    console.error("[processMessage] Error:", error);
    return {
      text: "An error occurred while processing your message.",
    };
  }
};

/** Returns available providers (id/label) for autocomplete/UX. */
export function listProviders(): Array<{ id: AIProviderId; label: string }> {
  return Object.values(providers).map((provider) => ({
    id: provider.id,
    label: provider.label,
  }));
}

/** Lists known models for a provider. */
export function listModelsForProvider(providerId: string): string[] {
  if (!isProviderAvailable(providerId)) return [];
  return [...providers[providerId].models];
}

/** Default provider (used when there is no guild config or config is invalid). */
export function getDefaultProviderId(): AIProviderId {
  return DEFAULT_PROVIDER_ID;
}

/** Default model per provider (used when the saved model is not valid). */
export function getDefaultModelForProvider(providerId: string): string {
  if (!isProviderAvailable(providerId)) return DEFAULT_GEMINI_MODEL;
  return providers[providerId].defaultModel;
}

/** Type guard para providers soportados. */
export function isProviderAvailable(
  providerId: string,
): providerId is AIProviderId {
  return providerId in providers;
}

/** Checks if the model exists within the given provider. */
export function isModelAvailableForProvider(
  providerId: string,
  model: string,
): boolean {
  return listModelsForProvider(providerId).includes(model);
}

/**
 * Generic entry point to generate text according to guild configuration.
 *
 * Typical use: listeners (forumAutoReply) and commands (joke) build a prompt and call this.
 */
export async function generateForGuild(options: {
  guildId?: string | null;
  userId?: string | null;
  messages: Message[];
  overrides?: AIRequestOptions;
}): Promise<AIResponse> {
  const resolved = await resolveProviderConfig(
    options.guildId,
    options.overrides?.model,
  );

  // Rate limit check
  if (options.guildId && options.userId) {
    const config = await configStore.get(
      options.guildId,
      ConfigurableModule.AI,
    );
    if (config.rateLimitEnabled) {
      const outcome = await aiRateLimiter.consume(
        options.guildId,
        options.userId,
        config.rateLimitMax,
        config.rateLimitWindow,
      );

      if (!outcome.allowed) {
        return {
          text: `You have reached the limit of **${config.rateLimitMax}** requests per **${config.rateLimitWindow}** seconds on this server. Try again in **${Math.ceil((outcome.resetAt - Date.now()) / 1000)}** seconds.`,
        };
      }
    }
  }

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
