# Capa de datos (Mongo + Mongoose)

Guia para entender y usar la persistencia del bot. Todo vive en `src/db` y se apoya en Mongoose sobre MongoDB.

## TL;DR rapido

- Usa `@/db/repositories/*` en lugar de hablar directo con los modelos.
- No necesitas abrir la conexion: cada repo llama `connectMongo()` de `src/db/client.ts`, que reutiliza una promesa global.
- Variables de entorno: `MONGO_URI` o `DB_URI` (URI completa) y `MONGO_DB_NAME` o `DB_NAME` (por defecto `pyebot`).
- `fixDb()` se ejecuta en el bootstrap (`src/index.ts`) para rellenar defaults y tipos en documentos existentes; no sustituye migraciones estructurales.
- IDs clave: usuarios y guilds usan el Discord ID como `_id`, y varias colecciones usan claves compuestas (`guildId:name`, `guildId:userId:roleId:ruleName:type`).

## Mapa de carpetas

- `src/db/client.ts`: abre/cierra la conexion a Mongo de forma perezosa.
- `src/db/helpers.ts`: utilidades puras (`deepClone`) usadas para copiar documentos sin referencias compartidas.
- `src/db/fixDb.ts`: normaliza documentos existentes segun los defaults y tipos de cada schema.
- `src/db/models/*`: definicion de esquemas Mongoose (shape y indices por coleccion).
- `src/db/repositories/*`: API de acceso a datos; exponen funciones de dominio y encapsulan Mongoose.
- `src/db/index.ts`: reexporta modelos/repositorios para importacion unica.

## Conexion y ciclo de vida

- `connectMongo({ uri?, dbName? })` lee `MONGO_URI`/`DB_URI` y `MONGO_DB_NAME`/`DB_NAME`, memoiza la promesa y habilita `serverApi` v1.
- `disconnectMongo()` existe para tests/apagados; en runtime normal no es necesario llamarlo manualmente.
- Los repositorios llaman `connectMongo()` al inicio de cada operacion, asi que no mezcles conexiones externas.

## Normalizacion en arranque: `fixDb()`

- Recorre cada schema y construye un `$set` que rellena valores faltantes y corrige tipos basandose en defaults del schema.
- Casos especiales: fusiona defaults en subdocs de `warns`, limpia arreglos de `openTickets`/`pendingTickets` dejando solo strings.
- Se ejecuta al iniciar el bot (`src/index.ts`). Si cambias defaults o agregas campos, vuelve a correr el bot para que `fixDb()` alinee documentos antiguos.
- No reemplaza migraciones de datos complejas (renombrar campos, mover colecciones); esas siguen siendo manuales.

## Modelos y colecciones

### `users` (`src/db/models/user.ts`)

- `_id`: Discord userId. Campos numericos: `rep`, `bank`, `cash`.
- `warns`: arreglo de objetos `{ reason, warn_id, moderator, timestamp }`.
- `openTickets`: arreglo de ids de canales.
- `currency` e `inventory`: `Schema.Types.Mixed` para saldos e inventario del juego.
- Virtual `id` expone `_id` como alias. Sin versionado Mongoose (`versionKey: false`).

### `guilds` (`src/db/models/guild.ts`)

- `_id`: Discord guildId. Campos mixtos para `roles`, `channels`, `features`.
- `pendingTickets`: ids de tickets abiertos; `reputation.keywords`: palabras clave configurables.
- Features disponibles en `Features` (tickets, automod, autoroles, warns, roles, reputation, reputationDetection, tops, suggest, economy, game) con defaults `true`.
- Timestamps `createdAt`/`updatedAt` habilitados.

### Autoroles (`src/db/models/autorole.ts`)

- Reglas (`autorole_rules`): `_id = guildId:name`, `triggerType` (mensaje, reaccion, reputacion, antiguedad), `args` dinamicos, `roleId`, `durationMs`, `enabled`, `createdBy`. Indices por `guildId`, por `guildId+roleId`.
- Grants (`autorole_role_grants`): `_id = guildId:userId:roleId:ruleName:type`, `type` `LIVE|TIMED`, `expiresAt`. Indices para lookups por guild/usuario/rol y expiracion.
- Contadores (`autorole_reaction_tallies`): `_id = guildId:messageId:emojiKey`, guarda `authorId`, `count`, `updatedAt`. Indice por `guildId+emojiKey`.

### `offers` (`src/db/models/offers.ts`)

- Estados: `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `CHANGES_REQUESTED`, `WITHDRAWN`.
- Campos clave: `details` (schema embebido con titulo/descripcion/etc), `embed` serializado, mensajes/canales de revision y publicacion, `rejectionReason`, `changesNote`, `lastModeratorId`.
- Indices: `{ guildId, authorId }` unico parcial cuando el estado es activo (`PENDING_REVIEW` o `CHANGES_REQUESTED`); indices por estado y guild.

### TOPs (`src/db/models/tops.ts`)

- Ventana activa (`top_windows`): `_id = guildId`, `channelId`, `intervalMs` (default 7d), `topSize` (default 10), `windowStartedAt`, `lastReportAt`, mapas numericos (`emojiCounts`, `channelCounts`, `reputationDeltas`). Indice por `guildId`.
- Reportes (`top_reports`): snapshots historicos con `periodStart/periodEnd`, conteos y metadata opcional. Indices por `guildId` descendente y `periodEnd`.

## Repositorios: como usarlos

### `repositories/users.ts`

- `getUser`, `userExists`, `ensureUser`, `upsertUser`, `updateUser`, `removeUser`: gestion basica del documento; `ensureUser` crea con defaults.
- Economia: `bumpBalance`, `depositCoins`, `withdrawCoins` (las dos ultimas devuelven `Result` con errores `INVALID_AMOUNT` o `INSUFFICIENT_FUNDS`).
- Reputacion: `getUserReputation`, `setUserReputation`, `adjustUserReputation` (usa pipeline para clamp a 0).
- Warns: `listWarns`, `setWarns`, `addWarn`, `removeWarn`, `clearWarns`.
- Tickets: `listOpenTickets`, `setOpenTickets`, `addOpenTicket`, `removeOpenTicket`, `removeOpenTicketByChannel` (deduplica y limpia valores no string).
- `currency` e `inventory` se manipulan via `ensureUser`/`updateUser`/`upsertUser` desde los modulos de economia/juego.

### `repositories/guilds.ts`

- Core CRUD: `getGuild`, `ensureGuild`, `updateGuild`, `deleteGuild` (rellena defaults de features/channels/roles).
- Features: `readFeatures`, `setFeature`, `setAllFeatures` con validacion contra `DEFAULT_GUILD_FEATURES`.
- Canales: `readChannels`/`writeChannels` (mutador funcional), `setCoreChannel`, `getCoreChannel`, `setTicketCategory`, `setTicketMessage`.
- Canales gestionados: `listManagedChannels`, `addManagedChannel`, `updateManagedChannel`, `removeManagedChannel` (genera claves a partir del label).
- Tickets pendientes: `getPendingTickets`, `setPendingTickets` (sanitiza y deduplica).
- Roles de guild: `readRoles`, `writeRoles`, `getRole`, `upsertRole`, `removeRole`, `ensureRoleExists`.
- Overrides y limites: `getRoleOverrides`, `setRoleOverride`, `clearRoleOverride`, `resetRoleOverrides`, `getRoleLimits`, `setRoleLimit`, `clearRoleLimit` (normaliza las keys a snake_case).

### `repositories/with_guild.ts`

- Patrion funcional para mutar un documento completo de guild: `withGuild(id, callback)` crea si no existe, ejecuta el callback y marca campos mixtos como modificados.
- Uso recomendado para configuraciones de baja concurrencia (dashboard). No usar para contadores o operaciones que requieran atomicidad; para eso existen los metodos de `repositories/guilds.ts`.

### `repositories/autorole.ts`

- Reglas: `autoRoleFetchRulesByGuild/All`, `autoRoleFetchRule`, `autoRoleInsertRule`, `autoRoleUpdateRuleEnabled`, `autoRoleDeleteRule`, wrappers `createRule`, `enableRule`, `disableRule`, `deleteRule`, `refreshGuildRules`, `loadRulesIntoCache`.
- Grants: `autoRoleUpsertGrant`, `autoRoleDeleteGrant`, `autoRoleListReasonsForMemberRole`, `autoRoleListReasonsForRule`, `autoRoleCountReasonsForRole`, `autoRoleFindGrant`, `autoRoleListDueTimedGrants`, `autoRolePurgeGrantsForRule`, `autoRolePurgeGrantsForGuildRole`, helpers de alto nivel `grantByRule`, `revokeByRule`, `purgeRule`.
- Tallies de reacciones: `autoRoleIncrementReactionTally`, `autoRoleDecrementReactionTally`, `autoRoleReadReactionTally`, `autoRoleDeleteReactionTally`, `autoRoleListTalliesForMessage`, `autoRoleDeleteTalliesForMessage`, helpers `incrementReactionTally`, `decrementReactionTally`, `readReactionTally`, `removeReactionTally`, `drainMessageState`.
- Cache: integra con `@/modules/autorole/cache` para mantener reglas y contadores en memoria; los helpers `trackPresence/clearTrackedPresence` escriben solo en cache.
- Reglas de reputacion: `upsertReputationRule`, `applyReputationPreset` crean/actualizan presets y limpian reglas sobrantes del mismo tipo.

### `repositories/offers.ts`

- Devuelven `Result` para manejo explicito de errores.
- Creacion: `createOffer` (falla con `ACTIVE_OFFER_EXISTS` si hay oferta activa del autor).
- Lectura: `findById`, `findActiveByAuthor`.
- Escritura: `updateOffer` (patch libre) y `transitionOffer` (cambia estado solo si el actual pertenece a `allowedFrom`).
- Listado: `listByStatus` por guild y estado.

### `repositories/tops.ts`

- Configuracion/ventana: `ensureTopWindow`, `getTopWindow`, `updateTopConfig`, `resetTopWindow` (abre nueva ventana limpiando contadores).
- Contadores: `bumpEmojiCounts`, `bumpChannelCount`, `bumpReputationDelta` (usan `$inc` atomico).
- Scheduler: `findDueWindows` devuelve ventanas cuya `windowStartedAt + intervalMs <= now`.
- Reportes: `persistTopReport` guarda snapshot historico, `rotateWindowAfterReport` reinicia ventana al emitir, `listReports` lee historico.

## Como extender la capa de datos

- Nuevos campos: agrega el campo al schema correspondiente en `src/db/models/*` con `default` si aplica. Considera si necesitas un indice.
- Normalizacion: tras cambiar defaults/campos, reinicia el bot para que `fixDb()` aplique a documentos existentes.
- Nuevos repos o metodos: crea funciones pequenas que llamen `connectMongo()`, usen operaciones atomicas (`$inc`, `findOneAndUpdate`) y devuelvan datos ya mapeados (evita exponer documentos de Mongoose).
- Cambios de estructura (renombrar campos, mover colecciones): escribe scripts/migraciones dedicadas; `fixDb()` no cubre ese caso.

## Desarrollo local

- Configura `MONGO_URI` apuntando a tu instancia (local o contenedor). `MONGO_DB_NAME` permite aislar bases por desarrollador.
- `fixDb()` se llama siempre en el arranque; si necesitas ejecutar solo la normalizacion, puedes importar y correr `await fixDb()` en un script ad hoc.
