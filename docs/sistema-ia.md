# Sistema de IA

Este documento describe cómo funciona el sistema de inteligencia artificial del bot: configuración, proveedores, modelos y límites.

## Objetivos

- **Abstracción**: Unificar múltiples proveedores (Gemini, OpenAI, etc.) bajo una interfaz común.
- **Configuración por Servidor**: Permitir que cada guild elija su proveedor y modelo preferido.
- **Trazabilidad**: Mantener logs útiles y metadatos normalizados de cada interacción.

## Arquitectura del Servicio

El núcleo de la IA reside en `src/services/ai/`.

- **Orquestador (`index.ts`)**: Es el punto de entrada principal. Resuelve la configuración del servidor, gestiona la memoria de la conversación y expone métodos de alto nivel para procesar mensajes o generar contenido.
- **Adaptadores**: Cada proveedor tiene su propio adaptador (ej. `gemini.ts`, `openai.ts`) que implementa la interfaz común para traducir las peticiones al SDK correspondiente.
- **Gestión de Respuestas (`response.ts`)**: Normaliza las respuestas de los distintos modelos, gestionando el truncado y los motivos de finalización.
- **Límites y Seguimiento**: Controla la frecuencia de uso (`rateLimiter.ts`) y realiza el seguimiento de mensajes (`messageTracker.ts`) para mantener el contexto.

## Configuración

La configuración se gestiona mediante el sistema centralizado de configuración del bot:

- **Proveedor**: El motor de IA a utilizar (ej: `gemini`, `openai`).
- **Modelo**: El modelo específico del proveedor (ej: `gemini-1.5-flash`, `gpt-4o`).

Los comandos de configuración permiten cambiar estos valores en tiempo real, validando que el modelo sea compatible con el proveedor seleccionado.

## Flujo de Continuación

Cuando una respuesta de la IA se trunca por límites de tokens:

1. El sistema añade un aviso visual y un **botón de continuación**.
2. Al presionar el botón, se envía una nueva petición que incluye el contexto previo necesario para continuar la respuesta sin duplicar información.
3. El bot también puede continuar la conversación si un usuario responde directamente (reply) a un mensaje generado por la IA.

## Integraciones

La IA se integra de forma transparente en varios puntos del bot:

- **Menciones**: Respuestas naturales a menciones directas.
- **Auto-respuesta**: Soporte automático en canales específicos (ej. foros).
- **Comandos de diversión**: Generación de chistes, historias o contenido creativo.

## Extensibilidad

Añadir un nuevo proveedor requiere:

1. Crear un nuevo adaptador que cumpla con la interfaz `AIProvider`.
2. Registrar el nuevo proveedor y sus modelos en las constantes del servicio.
3. El orquestador lo detectará automáticamente y estará disponible para su configuración.
