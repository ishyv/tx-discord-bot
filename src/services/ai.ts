/**
 * Motivación: encapsular las llamadas a Google Gemini y la gestión de memoria contextual para respuestas de IA.
 *
 * Idea/concepto: construye prompts combinando mensajes previos, aplica configuraciones de seguridad y persiste memoria volátil por usuario.
 *
 * Alcance: produce texto (o imágenes) a partir de la API; no decide flujos de negocio que consumen la respuesta.
 */
import {
  type Content,
  type GenerateContentParameters,
  type GenerateContentResponse,
  GoogleGenAI,
  Modality,
} from "@google/genai";
import { BOT_PROMPT, SAFETY_SETTINGS } from "@/constants/ai";
import { getContextMessages } from "@/utils/getContext";
import { type Message, userMemory } from "@/utils/userMemory";

// Respuesta por defecto si la API no responde
// Ej. si la clave de google gemini no es válida
const DEFAULT_NO_API_RESPONSE = "Mejor comamos un poco de sushi! 🍣";

// Validate API key at module load
const API_KEY = process.env.GOOGLE_GENAI_API_KEY;
if (!API_KEY) {
  console.warn('[ai-service] GOOGLE_GENAI_API_KEY not set - AI features will return default responses');
}

const genAI = new GoogleGenAI({
  apiKey: API_KEY,
});

interface ProcessMessageOptions {
  userId: string;
  message: string;
  quotedText?: string;
}

interface AIResponse {
  text: string;
  image?: Buffer;
}

export const processMessage = async ({
  userId,
  message,
  quotedText,
}: ProcessMessageOptions): Promise<AIResponse> => {
  try {
    const memory = userMemory.get(userId);

    const context = quotedText ? await getContextMessages(quotedText) : [];

    const messages: Message[] = [
      ...context,
      ...memory,
      { role: "user", content: message },
    ];

    const aiResponse = await callGeminiAI(messages);

    userMemory.append(userId, { role: "user", content: message });
    userMemory.append(userId, { role: "model", content: aiResponse.text });

    return aiResponse;
  } catch (error) {
    console.error("[processMessage] Error:", error);
    return {
      text: "Ocurrió un error procesando tu mensaje.",
    };
  }
};

// Por ahora deshabilitamos la respuesta de IMAGEN porque no funciona bien
export const callGeminiAI = async (
  messages: Message[],
  options: Omit<GenerateContentParameters, "contents"> = {
    model: "gemini-2.5-flash",
    config: {
      safetySettings: SAFETY_SETTINGS,
      candidateCount: 1,
      maxOutputTokens: 800,
      temperature: 0.68,
      topK: 35,
      topP: 0.77,
      responseModalities: [Modality.TEXT],
    },
  },
): Promise<AIResponse> => {
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

  const params = { contents, ...options };

  try {
    const response = await genAI.models.generateContent(params);
    return await processResponse(response);
  } catch (e) {
    console.error("[callGeminiAI] Error:", e);
    return {
      text: DEFAULT_NO_API_RESPONSE,
    };
  }
};

async function processResponse(
  response: GenerateContentResponse,
): Promise<{ text: string; image?: Buffer }> {
  let text = "";
  let image: Buffer | undefined;

  const candidates = response?.candidates ?? [];

  if (candidates.length === 0) {
    return { text: DEFAULT_NO_API_RESPONSE };
  }

  const parts = candidates[0].content?.parts ?? [];

  for (const part of parts) {
    if ("text" in part && typeof part.text === "string") {
      text += part.text;
    } else if (part?.inlineData?.mimeType && part.inlineData.data) {
      image = Buffer.from(part.inlineData.data, "base64");
    }
  }

  return {
    text: text.trim() || DEFAULT_NO_API_RESPONSE,
    image,
  };
}
