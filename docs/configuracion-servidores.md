# Configuraci�n de servidores

Gu�a r�pida para entender las piezas que gobiernan qu� features est�n encendidas, d�nde se guardan los canales/roles clave y c�mo se hace cumplir la pol�tica de l�mites en comandos.

## Features y toggles
- Cat�logo en `src/modules/features/index.ts` usando el enum `Features` de `src/db/models/guild.schema.ts`. Se cachea por guild 30s para evitar Golpear Mongo en cada comando.
- El decorador `@BindDisabled` (`src/modules/features/decorator.ts`) marca comandos que dependen de una feature. El middleware `featureToggle` (`src/middlewares/featureToggle.ts`) consulta `isFeatureEnabled` y corta la ejecuci�n con un mensaje ef�mero si la flag est� apagada.
- `setFeatureFlag` y `setAllFeatureFlags` escriben en Mongo v�a `withGuild` (`src/db/repositories/with_guild.ts`), centralizando el origen de verdad para dashboards o comandos de configuraci�n.
- Racional: permitir que administradores apaguen sistemas completos (econom�a, tickets, automod, etc.) sin desplegar c�digo ni borrar comandos, y que los comandos fallen de forma amable.

## Canales administrados
- `src/modules/guild-channels/index.ts` ofrece helpers para leer/escribir los canales "core" (tickets, logs, rep, ofertas, etc.) y una colecci�n `managed` para canales arbitrarios creados por el bot.
- El esquema vive en `src/db/models/guild.schema.ts` bajo `channels.core` y `channels.managed`. La funci�n `removeInvalidChannels` revisa contra la API de Discord y limpia canales borrados.
- Comandos de configuraci�n en `src/commands/moderation/channels/*.ts` y `src/commands/moderation/tickets/config.command.ts` son las entradas de usuario; todos delegan en el m�dulo para evitar diferencias de formato.
- Racional: consolidar IDs de canales sensibles (logs, staff, tickets) en un �nico documento por guild y reducir riesgo de referencias rotas.

## Roles gestionados y l�mites de moderaci�n
- El dominio de roles se modela en `src/modules/guild-roles/index.ts` usando los campos `roles` del schema de guild. Cada rol gestionado puede tener:
  - *Overrides* por acci�n (`allow`/`deny`/`inherit`) para comandos de moderaci�n.
  - *L�mites* con ventanas deslizantes (`limit` + `windowSeconds`) para ratear acciones sensibles.
- El middleware `moderationLimit` (`src/middlewares/moderationLimit.ts`) es el punto de aplicaci�n: resuelve overrides con `resolveRoleActionPermission` y consume l�mites con `consumeRoleLimits` antes de ejecutar el comando. Si un rol supera el cupo, el middleware bloquea y responde con un embed explicativo.
- `roleRateLimiter` y snapshots (`listGuildRoleSnapshots`) garantizan que las claves de acci�n se normalicen (`timeout`, `kick`, etc.) y que una sola ejecuci�n no consuma doble.
- Racional: trasladar la pol�tica de moderaci�n al estado del guild en DB para que el staff la cambie sin tocar c�digo, y asegurar que comandos respeten los l�mites incluso si el usuario tiene permisos nativos de Discord.

## Canales de logs
- `src/utils/moderationLogger.ts` encapsula el formato y destino de logs de moderaci�n. Usa `getGuildChannels` para detectar `generalLogs`/`messageLogs`/`voiceLogs`/`pointsLog` y env�a embeds consistentes.
- Listeners como `src/events/listeners/moderationLogs.ts`, `voiceLogs.ts` e `inviteLogs.ts` escuchan los hooks y despachan al logger. Se dise�� as� para que mover el canal de logs solo requiera actualizar `channels.core` sin cambiar listeners.

## Cooldowns y protecci�n de spam
- `src/modules/cooldown` mantiene buckets por usuario y contexto. El middleware `cooldown` (`src/middlewares/cooldown.ts`) consulta `context.client.cooldown.context(...)` y, si hay un tiempo restante, responde con un timestamp relativo en lugar de dejar que el comando ejecute.
- Racional: evitar flood involuntario de comandos baratos (ping, embedplay, etc.) sin meter l�gica de temporizadores en cada handler individual.
