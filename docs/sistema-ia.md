# Sistema de IA

Este documento describe como funciona el sistema de IA del bot: configuracion por guild, proveedores, modelos, limites y puntos de integracion.

## Objetivos

- Unificar multiples proveedores (Gemini hoy, OpenAI tambien) bajo una interfaz comun.
- Mantener configuracion por guild (provider + model) usando el sistema existente (`configStore`).
- Evitar que listeners/comandos dependan de detalles del SDK de cada proveedor.
- Tener trazabilidad: meta normalizada (finishReason, usage, rawText) y logs utiles.

## Arquitectura (alto nivel)

El "entrypoint" para consumidores es `src/ai/index.ts`.

- `src/ai/index.ts`: orquestador. Lee config por guild, resuelve provider/model, mantiene memoria efimera por usuario (`userMemory`) y expone helpers de alto nivel:
  - `processMessage(...)`: conversacion tipo "chat" con memoria por usuario.
  - `generateForGuild(...)`: generacion por prompt/mensajes con provider/model de la guild.
  - `listProviders()`, `listModelsForProvider()`: usados por comandos/autocomplete.
- `src/ai/gemini.ts`: adapter Gemini (SDK `@google/genai`).
- `src/ai/openai.ts`: adapter OpenAI (SDK `openai`).
- `src/ai/constants.ts`: IDs de providers, modelos soportados y defaults.
- `src/ai/types.ts`: interfaz `AIProvider` + tipos compartidos.
- `src/ai/response.ts`: normalizacion de respuestas (texto final, rawText, finishReason, logs).

## Configuracion por guild

La configuracion se guarda dentro del documento `Guild` en la ruta `ai` (via `ConfigurableModule.AI`):

- `provider`: string (ej: `gemini`, `openai`)
- `model`: string (ej: `gemini-2.5-flash`, `gpt-4o-mini`)

Fuentes principales:

- Schema/definicion de config: `src/commands/ai/config.ts`
- Mapeo hacia Mongo (paths): `src/configuration/provider.ts` (`ConfigurableModule.AI -> ai`)
- Normalizacion/defaults en DB: `src/db/schemas/guild.ts` y `src/db/repositories/guilds.ts`

### Comandos de configuracion

Los comandos viven en `src/commands/ai/*`:

- `/ai set-provider <provider>`: setea provider y ajusta el modelo al default de ese provider.
- `/ai set-model <model>`: setea el modelo para el provider actual.

Ambos usan `listProviders()` / `listModelsForProvider()` para choices/autocomplete.

## Variables de entorno

- `GEMINI_API_KEY`: habilita el provider Gemini.
- `OPENAI_API_KEY`: habilita el provider OpenAI.

Si una key no esta configurada, el provider correspondiente devuelve una respuesta fallback y emite un warning de log.

## Respuesta normalizada y truncado

Todos los providers devuelven `AIResponse` con:

- `text`: texto final (puede incluir una nota si se corto por tokens).
- `meta.rawText`: texto "puro" del modelo (sin la nota).
- `meta.finishReason`: reason normalizado (reusamos `FinishReason` de Google para consistencia interna).

Cuando `finishReason === MAX_TOKENS`, `src/ai/response.ts` agrega una nota estandar (`TRUNCATION_NOTICE`) al `text`.

### Continuacion (boton "Continuar")

Los listeners agregan un boton cuando `finishReason === MAX_TOKENS`:

- `src/events/listeners/aiResponse.ts` (menciones al bot)
- `src/events/listeners/forumAutoReply.ts` (respuestas automaticas en foros)

Al presionar el boton se envia un nuevo request con un prompt de continuacion y contexto suficiente para seguir sin duplicar.

### Continuacion por reply (sin mencionar al bot)

Ademas del boton, el bot continua la conversacion cuando un usuario responde (reply) a un mensaje del bot que fue generado por IA.

- Marcado: los mensajes generados por IA incluyen el sufijo `AI_GENERATED_MESSAGE` en el contenido (ver `src/constants/ai.ts`).
- Listener: `src/events/listeners/aiResponse.ts` detecta replies verificando si el mensaje referenciado contiene ese marcador.

## Puntos de integracion en el bot

- Menciones al bot: `src/events/listeners/aiResponse.ts` usa `processMessage(...)`.
- Auto-reply en foros: `src/events/listeners/forumAutoReply.ts` usa `generateForGuild(...)`.
- Comandos que generan texto: ej `src/commands/fun/joke.ts` usa `generateForGuild(...)`.

## Agregar un nuevo provider

Pasos recomendados (minimos):

1) Crear un modulo `src/ai/<provider>.ts` que exporte un `AIProvider`.
2) Registrar el provider en:
   - `src/ai/constants.ts`: agregar el id a `PROVIDER_IDS` y lista de modelos/defaults.
   - `src/ai/index.ts`: agregarlo al `providers` registry.
3) Asegurar que el adapter devuelva `AIResponse` usando `buildAIResponse(...)`.

## Debug / Diagnostico rapido

- Ver que provider/model esta usando una guild: revisar `Guild.ai` en Mongo.
- Revisar logs por truncado: el sistema loggea finishReason != STOP con `providerId`, `model` y `usage`.
- Si OpenAI/Gemini devuelve fallback, chequear que la env var correspondiente este presente.
