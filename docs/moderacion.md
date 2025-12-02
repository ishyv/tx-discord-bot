# Moderaci�n y reputaci�n

Resumen de los sistemas que protegen el servidor y registran acciones disciplinarias. Se centra en las decisiones de dise�o y en d�nde se encuentran las piezas clave.

## AutoMod
- L�gica central en `src/systems/automod/index.ts`, activada por el listener `src/events/listeners/autoModSystem.ts` cuando la feature `Features.Automod` est� encendida.
- Pipeline: primero aplica filtros r�pidos sobre el texto (`spamFilterList` y `scamFilterList` en `src/constants/automod.ts`), luego decide si vale la pena inspeccionar adjuntos. Solo analiza im�genes y usa OCR (`src/services/ocr`) m�s `phash` para detectar coincidencias en cach� y evitar trabajo repetido.
- Cache ef�mera persistida en disco (`Cache` de `src/utils/cache.ts`) para recordar im�genes marcadas y minimizar falsos positivos recurrentes. Las alertas se env�an al canal de staff configurado en `channels.core` mediante `getGuildChannels`.
- Racional: actuar en tiempo real sin bloquear el loop principal, aprovechar OCR para estafas basadas en im�genes y mantener trazabilidad hacia el equipo de staff en lugar de borrar silenciosamente.

## Warns y reputaci�n
- Warns se almacenan en `users.warns` (schema en `src/db/models/user.schema.ts`) y se gestionan a trav�s del repositorio `src/db/repositories/users.ts` para deduplicar IDs y normalizar el formato.
- Comandos `/moderation warn *` (`src/commands/moderation/warn/*.ts`) generan IDs legibles con `utils/warnId.ts`, registran al moderador que aplic� la acci�n y env�an logs mediante `logModerationAction`.
- El flujo de reputaci�n tiene dos frentes: comandos manuales (`src/commands/moderation/rep/*.ts`) y detecci�n autom�tica (`src/events/listeners/reputationDetection.ts`). Este �ltimo escucha mensajes, busca keywords configuradas en `guild.reputation.keywords` y env�a solicitudes al canal `repRequests` si la feature `Features.ReputationDetection` est� activa.
- Racional: separar la captura de eventos (mensajes) de la aplicaci�n de reputaci�n efectiva, de modo que el staff confirme o revise solicitudes en lugar de otorgar puntos autom�ticamente.

## L�mites y overrides de moderaci�n
- El middleware `moderationLimit` (`src/middlewares/moderationLimit.ts`) se ejecuta antes de cualquier comando y consulta el m�dulo `src/modules/guild-roles`. Los overrides permiten negar/permitir acciones espec�ficas por rol; los l�mites ponen cuotas por ventana de tiempo.
- El dise�o obliga a que incluso usuarios con permisos de Discord respeten la pol�tica del bot y deja trazabilidad expl�cita cuando un comando se bloquea (embeds de rechazo explican la fuente del bloqueo).

## Logs y auditor�a
- `src/utils/moderationLogger.ts` centraliza el formato de embeds y destinos. Se invoca desde los listeners `src/events/listeners/moderationLogs.ts`, `voiceLogs.ts`, `inviteLogs.ts` y por servicios como `offers` al tomar decisiones.
- Los listeners de logs se enganchan a los hooks de mensajes/canales (`src/events/hooks/*`) para registrar eliminaciones, ediciones y cambios estructurales. Se eligi� este enfoque para no mezclar auditor�a con la l�gica de cada comando y para que la configuraci�n del canal de logs sea el �nico punto de personalizaci�n.
