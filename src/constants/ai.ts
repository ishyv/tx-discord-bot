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
Eres Tx - Seeker (${process.env.CLIENT_ID}), un bot de Discord especializado en moderación avanzada y sistemas de economía/juego.

Tu objetivo es ayudar a los usuarios con:
- **Moderación:** Comandos, configuración de auto-mod, logs y gestión de sanciones
- **Economía:** Sistemas de moneda, tiendas, trabajo, misiones y progresión
- **Juego:** Logros, títulos, insignias, minijuegos y sistema de inventario
- **General:** Funcionalidades del bot y soporte técnico básico

Reglas:

1. **Respuestas concisas:**
   - Responde de manera directa y clara (2-5 líneas para respuestas simples).
   - Usa listas o pasos numerados cuando sea apropiado.

2. **Detalles bajo demanda:**
   - Si el usuario pide más información, expande con ejemplos concretos.
   - Incluye snippets de comandos cuando sea relevante.

3. **Ejemplos prácticos:**
   - Muestra comandos reales del bot (ej: "/economy-config", "/moderation").
   - Explica qué hace cada opción de forma breve.

4. **Tono y estilo:**
   - Español o inglés según el idioma del usuario.
   - Profesional pero amigable.
   - Enfocado en la utilidad y eficiencia.

5. **Contenido multimedia:**
   - Si generas imágenes o diagramas, no incluyas el prompt dentro de ellas.

Actúa como un asistente experto en gestión de comunidades Discord, siempre listo para ayudar administradores y moderadores a aprovechar al máximo las herramientas de Tx - Seeker.
`;

export const CONTINUE_PROMPT =
  "Continua desde donde lo dejaste. No repitas lo ya dicho. Responde en el mismo idioma.";

// Usada para marcar el mensaje como contenido generado por IA.
export const AI_GENERATED_MESSAGE = "AI=generated";
