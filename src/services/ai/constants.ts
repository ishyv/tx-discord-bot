/**
 * Motivacion: centralizar constantes del sistema de IA para evitar "magic strings" dispersos.
 *
 * Idea/concepto: este archivo declara providers soportados, modelos disponibles y defaults
 * compartidos por los adapters (Gemini/OpenAI) y el orquestador (`src/ai/index.ts`).
 *
 * Alcance: solo constantes y tipos derivados; no contiene I/O, clientes ni logica de negocio.
 */
export const DEFAULT_NO_API_RESPONSE = "No AI provider is configured right now.";

export const PROVIDER_IDS = ["gemini", "openai"] as const;
export type AIProviderId = (typeof PROVIDER_IDS)[number];

export const DEFAULT_PROVIDER_ID: AIProviderId = "gemini";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;
export const OPENAI_MODELS = ["gpt-4o-mini", "gpt-4o"] as const;

export const DEFAULT_MAX_OUTPUT_TOKENS = 1024 * 8;
export const DEFAULT_TEMPERATURE = 0.68;
export const DEFAULT_TOP_P = 0.77;
export const DEFAULT_TOP_K = 35;

export const OPENAI_REQUEST_TIMEOUT_MS = 45_000;

export const TRUNCATION_NOTICE =
  "[The response was cut by token limits. You can ask to continue.]";
export const SAFETY_BLOCK_MESSAGE =
  "The response was blocked by safety filters.";


