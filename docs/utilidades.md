# Utilidades Globales

`src/utils` contiene herramientas transversales que deben ser reutilizadas en lugar de re-implementadas. Este documento cataloga las más importantes.

## Patrón Result (`result.ts`)

El proyecto evita usar `try/catch` para errores de flujo de negocio (ej. "usuario sin fondos"). En su lugar, usa un tipo `Result<T, E>`.

- **Uso**: `Result.ok(valor)` o `Result.err(error)`.
- **Beneficio**: Obliga al consumidor a manejar explícitamente el caso de fallo.
- **Ejemplo**:
  ```typescript
  const resultado = await servicio.crearOferta(...);
  if (resultado.isErr()) {
      return ctx.reply(`Error: ${resultado.error}`);
  }
  const oferta = resultado.unwrap();
  ```

## Logging de Moderación (`moderationLogger.ts`)

Centraliza el envío de embeds a canales de logs configurados.

- **Métodos**: `logModerationAction`, `logMessageEdit`, `logMessageDelete`.
- **Inteligencia**: Resuelve automáticamente el canal correcto (ej. `generalLogs`, `voiceLogs`) basándose en la configuración de la guild. No necesitas pasar el ID del canal manualmente.

## Caché en Disco (`cache.ts`)

Un sistema de caché persistente simple (JSON).

- **Uso**: Ideal para recordar estados no críticos entre reinicios que no merecen una colección completa en Mongo (ej. hashes de imágenes ya escaneadas por AutoMod).
- **API**: `get`, `set` con TTL opcional.

## Manejo de Tiempo (`ms.ts`)

Utilidades para parsear y formatear duraciones.

- `parseTime(string)`: Convierte "1d 2h" a milisegundos.
- `futureDate(ms)`: Devuelve una fecha futura segura.

## Identificadores de Warns (`warnId.ts`)

Generador de IDs cortos y legibles para advertencias (ej. `W-A1B2`).

- Diseñado para ser fácil de escribir por humanos en comandos de apelación.

## Economía (`economy.ts`)

Formatos de moneda y visualización.

- `formatCurrency(cantidad, moneda)`: Devuelve el string formateado con el símbolo correcto y separadores de miles.

## Memoria de Usuario (`userMemory.ts`)

Almacenamiento efímero en memoria para contextos de conversación (usado en IA).

- Gestiona historiales de chat por usuario con limpieza automática (LRU o TTL).
