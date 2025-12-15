# Moderación y reputación

Resumen de los sistemas que protegen el servidor y registran acciones disciplinarias. Se centra en las decisiones de diseño y en dónde se encuentran las piezas clave.

## AutoMod

- Lógica central en `src/systems/automod/index.ts`, activada por el listener `src/events/listeners/autoModSystem.ts` cuando la feature `Features.Automod` está encendida.
- Pipeline: primero aplica filtros rápidos sobre el texto (`spamFilterList` y `scamFilterList` en `src/constants/automod.ts`), luego decide si vale la pena inspeccionar adjuntos. Solo analiza imágenes y usa OCR (`src/services/ocr`) más `phash` para detectar coincidencias en caché y evitar trabajo repetido.
- Cache efímera persistida en disco (`Cache` de `src/utils/cache.ts`) para recordar imágenes marcadas y minimizar falsos positivos recurrentes. Las alertas se envían al canal de staff configurado en `channels.core` mediante `getGuildChannels`.
- Racional: actuar en tiempo real sin bloquear el loop principal, aprovechar OCR para estafas basadas en imágenes y mantener trazabilidad hacia el equipo de staff en lugar de borrar silenciosamente.

## Warns y reputación

- Warns se almacenan en `users.warns` (schema en `src/db/schemas/user.ts`) y se gestionan a través del repositorio `src/db/repositories/users.ts` para deduplicar IDs y normalizar el formato.
- Comandos `/moderation warn *` (`src/commands/moderation/warn/*.ts`) generan IDs legibles con `utils/warnId.ts`, registran al moderador que aplicó la acción y envían logs mediante `logModerationAction`.
- El flujo de reputación tiene dos frentes: comandos manuales (`src/commands/moderation/rep/*.ts`) y detección automática (`src/events/listeners/reputationDetection.ts`). Este último escucha mensajes, busca keywords configuradas en `guild.reputation.keywords` y envía solicitudes al canal `repRequests` si la feature `Features.ReputationDetection` está activa.
- Racional: separar la captura de eventos (mensajes) de la aplicación de reputación efectiva, de modo que el staff confirme o revise solicitudes en lugar de otorgar puntos automáticamente.

## Límites y overrides de moderación

- El middleware `moderationLimit` (`src/middlewares/moderationLimit.ts`) se ejecuta antes de cualquier comando y consulta el módulo `src/modules/guild-roles`. Los overrides permiten negar/permitir acciones específicas por rol; los límites ponen cuotas por ventana de tiempo.
- El diseño obliga a que incluso usuarios con permisos de Discord respeten la política del bot y deja trazabilidad explícita cuando un comando se bloquea (embeds de rechazo explican la fuente del bloqueo).

## Logs y auditoría

- `src/utils/moderationLogger.ts` centraliza el formato de embeds y destinos. Se invoca desde los listeners `src/events/listeners/moderationLogs.ts`, `voiceLogs.ts`, `inviteLogs.ts` y por servicios como `offers` al tomar decisiones.
- Los listeners de logs se enganchan a los hooks de mensajes/canales (`src/events/hooks/*`) para registrar eliminaciones, ediciones y cambios estructurales. Se eligió este enfoque para no mezclar auditoría con la lógica de cada comando y para que la configuración del canal de logs sea el único punto de personalización.
