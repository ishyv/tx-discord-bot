# Configuración de servidores

Guía rápida para entender las piezas que gobiernan qué features están encendidas, dónde se guardan los canales/roles clave y cómo se hace cumplir la política de límites en comandos.

## Features y toggles

- Catálogo en `src/modules/features/index.ts` usando el enum `Features` de `src/db/schemas/guild.ts`. Se cachea por guild 30s para evitar golpear Mongo en cada comando.
- El decorador `@BindDisabled` (`src/modules/features/decorator.ts`) marca comandos que dependen de una feature. El middleware `featureToggle` (`src/middlewares/featureToggle.ts`) consulta `isFeatureEnabled` y corta la ejecución con un mensaje efímero si la flag está apagada.
- `setFeatureFlag` y `setAllFeatureFlags` escriben en Mongo vía `withGuild` (`src/db/repositories/with_guild.ts`), centralizando el origen de verdad para dashboards o comandos de configuración.
- Racional: permitir que administradores apaguen sistemas completos (economía, tickets, automod, etc.) sin desplegar código ni borrar comandos, y que los comandos fallen de forma amable.

## Canales administrados

- `src/modules/guild-channels/index.ts` ofrece helpers para leer/escribir los canales "core" (tickets, logs, rep, ofertas, etc.) y una colección `managed` para canales arbitrarios creados por el bot.
- El esquema vive en `src/db/schemas/guild.ts` bajo `channels.core` y `channels.managed`. La función `removeInvalidChannels` revisa contra la API de Discord y limpia canales borrados.
- Comandos de configuración en `src/commands/moderation/channels/*.ts` y `src/commands/moderation/tickets/config.command.ts` son las entradas de usuario; todos delegan en el módulo para evitar diferencias de formato.
- Racional: consolidar IDs de canales sensibles (logs, staff, tickets) en un único documento por guild y reducir riesgo de referencias rotas.

## Roles gestionados y límites de moderación

- El dominio de roles se modela en `src/modules/guild-roles/index.ts` usando los campos `roles` del schema de guild. Cada rol gestionado puede tener:
  - _Overrides_ por acción (`allow`/`deny`/`inherit`) para comandos de moderación.
  - _Límites_ con ventanas deslizantes (`limit` + `windowSeconds`) para ratear acciones sensibles.
- El middleware `moderationLimit` (`src/middlewares/moderationLimit.ts`) es el punto de aplicación: resuelve overrides con `resolveRoleActionPermission` y consume límites con `consumeRoleLimits` antes de ejecutar el comando. Si un rol supera el cupo, el middleware bloquea y responde con un embed explicativo.
- `roleRateLimiter` y snapshots (`listGuildRoleSnapshots`) garantizan que las claves de acción se normalicen (`timeout`, `kick`, etc.) y que una sola ejecución no consuma doble.
- Racional: trasladar la política de moderación al estado del guild en DB para que el staff la cambie sin tocar código, y asegurar que comandos respeten los límites incluso si el usuario tiene permisos nativos de Discord.

## Canales de logs

- `src/utils/moderationLogger.ts` encapsula el formato y destino de logs de moderación. Usa `getGuildChannels` para detectar `generalLogs`/`messageLogs`/`voiceLogs`/`pointsLog` y envía embeds consistentes.
- Listeners como `src/events/listeners/moderationLogs.ts`, `voiceLogs.ts` e `inviteLogs.ts` escuchan los hooks y despachan al logger. Se diseñó así para que mover el canal de logs solo requiera actualizar `channels.core` sin cambiar listeners.

## Cooldowns y protección de spam

- `src/modules/cooldown` mantiene buckets por usuario y contexto. El middleware `cooldown` (`src/middlewares/cooldown.ts`) consulta `context.client.cooldown.context(...)` y, si hay un tiempo restante, responde con un timestamp relativo en lugar de dejar que el comando ejecute.
- Racional: evitar flood involuntario de comandos baratos (ping, embedplay, etc.) sin meter lógica de temporizadores en cada handler individual.
