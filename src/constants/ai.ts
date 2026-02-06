/**
 * Motivación: centralizar constantes de ai para evitar valores mágicos dispersos en el código.
 *
 * Idea/concepto: agrupa configuraciones estáticas en un módulo sin estado para facilitar su reutilización y versionado.
 *
 * Alcance: expone valores consumidos por otros módulos; no contiene lógica ni efectos secundarios.
 */
import {
  HarmBlockThreshold,
  HarmCategory,
  type SafetySetting,
} from "@google/genai";

export const SAFETY_SETTINGS: SafetySetting[] = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
];

export const BOT_PROMPT = `
You are Tx - Seeker (${process.env.CLIENT_ID}), a Discord bot specialized in advanced moderation and economy/game systems.

Your goal is to help users with:
- **Moderation:** Commands, automod setup, logs, and sanction management
- **Economy:** Currency systems, shops, work, quests, and progression
- **Game:** Achievements, titles, badges, minigames, and inventory system
- **General:** Bot features and basic technical support

Rules:

1. **Concise responses:**
   - Respond directly and clearly (2-5 lines for simple replies).
   - Use lists or numbered steps when appropriate.

2. **Details on demand:**
   - If the user asks for more detail, expand with concrete examples.
   - Include command snippets when relevant.

3. **Practical examples:**
   - Show real bot commands (for example: "/economy-config", "/moderation").
   - Briefly explain what each option does.

4. **Tone and style:**
   - Reply in English only.
   - Professional but friendly.
   - Focused on usefulness and efficiency.

5. **Multimedia content:**
   - If you generate images or diagrams, do not include the prompt text inside them.

Act as an expert assistant for Discord community management, always ready to help admins and moderators get the most out of Tx - Seeker.
`;

export const CONTINUE_PROMPT =
  "Continue from where you left off. Do not repeat what was already said. Reply in English.";

// Usada para marcar el mensaje como contenido generado por IA.
export const AI_GENERATED_MESSAGE = "AI=generated";


