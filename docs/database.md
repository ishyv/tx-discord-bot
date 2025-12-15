# Capa de datos (Mongo driver + Zod)

Guía para entender y usar la persistencia del bot. Todo vive en `src/db` y se apoya en el driver nativo de Mongo con Zod como única fuente de verdad.

## TL;DR rápido

- Usa `@/db/repositories/*`; no hables directo con colecciones.
- Conexión: `src/db/mongo.ts` exporta `getDb()` (MongoClient singleton). `src/index.ts` la inicializa en el arranque.
- Variables de entorno: `MONGO_URI` (URI completa) y `DB_NAME` (por defecto `pyebot`).
- Schemas: Zod en `src/db/schemas/*.ts` aplican defaults y validan lecturas/escrituras.
- IDs clave: usuarios y guilds usan el Discord ID como `_id`; otras colecciones usan claves compuestas (`guildId:name`, `guildId:userId:roleId:ruleName:type`, etc.).

## Mapa de carpetas

- `src/db/mongo.ts`: abre/cierra la conexión nativa (MongoClient singleton).
- `src/db/schemas/*.ts`: Zod schemas (única definición de shape + defaults).
- `src/db/repositories/*`: API de acceso a datos; exponen funciones de dominio y encapsulan el driver nativo.
- `src/db/helpers.ts`: utilidades puras (`deepClone`).
- `src/db/normalizers.ts`: helpers para listas, fechas, números.
- `src/db/index.ts`: fachada de la capa de persistencia (reexporta schemas, repos y helper de mongo).

## Conexión y ciclo de vida

- `getDb()` lee `MONGO_URI` y `DB_NAME` (default `pyebot`), memoiza el MongoClient y devuelve el `Db`.
- `disconnectDb()` existe para tests/apagados; en runtime normal no es necesario llamarlo manualmente.
- Los repositorios obtienen la colección vía `getDb().collection("nombre")`; no mezcles conexiones externas.

## Colecciones (Zod schemas en `src/db/schemas`)

### `users` (`user.ts`)

- `_id`: Discord userId. Campos numéricos: `rep`.
- `warns`: arreglo `{ reason, warn_id, moderator, timestamp }`.
- `openTickets`: arreglo de ids de canales.
- `currency` e `inventory`: objetos abiertos (records) para saldos e inventario del juego.
- Timestamps opcionales (`createdAt`/`updatedAt`).

### `guilds` (`guild.ts`)

- `_id`: Discord guildId. Campos mixtos para `roles`, `channels`, `features`.
- `pendingTickets`: ids de tickets abiertos; `reputation.keywords`: palabras clave configurables.
- Features disponibles en `Features` (tickets, automod, autoroles, warns, roles, reputation, reputationDetection, tops, suggest, economy, game) con defaults `true`.
- Timestamps opcionales.

### Autoroles (`autorole.ts`)

- Reglas (`autorole_rules`): `_id = guildId:name`, `trigger` discriminado (mensaje/reacción/umbral/etc), `roleId`, `durationMs`, `enabled`, `createdBy`.
- Grants (`autorole_role_grants`): `_id = guildId:userId:roleId:ruleName:type`, `type` `LIVE|TIMED`, `expiresAt`.
- Contadores (`autorole_reaction_tallies`): `_id = guildId:messageId:emojiKey`, `authorId`, `count`, `updatedAt`.

### `offers` (`offers.ts`)

- Estados: `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `CHANGES_REQUESTED`, `WITHDRAWN`.
- Campos clave: `details` (titulo/descripcion/etc), `embed` serializado, mensajes/canales de revisión/publicación, `rejectionReason`, `changesNote`, `lastModeratorId`.

### TOPs (`tops.ts`)

- Ventana activa (`top_windows`): `_id = guildId`, `channelId`, `intervalMs` (default 7d), `topSize` (default 10), `windowStartedAt`, `lastReportAt`, mapas numéricos (`emojiCounts`, `channelCounts`, `reputationDeltas`).
- Reportes (`top_reports`): snapshots históricos con `periodStart/periodEnd`, conteos y metadata opcional.

## Repositorios: cómo usarlos

### `repositories/users.ts`

- Core: `findUser`, `ensureUser`, `saveUser`, `deleteUser`.
- Reputación: `getUserReputation`, `setUserReputation`, `adjustUserReputation`.
- Warns: `listWarns`, `setWarns`, `addWarn`, `removeWarn`, `clearWarns`.
- Tickets: `listOpenTickets`, `setOpenTickets`, `addOpenTicket`, `removeOpenTicket`, `removeOpenTicketByChannel` (sanitiza/deduplica).
- CAS helpers: `replaceInventoryIfMatch`, `replaceCurrencyIfMatch` para transacciones optimistas en inventario/moneda.

### `repositories/guilds.ts`

- Core CRUD: `getGuild`, `ensureGuild`, `updateGuild`, `deleteGuild` (rellena defaults de features/channels/roles).
- Features: `readFeatures`, `setFeature`, `setAllFeatures` con validación contra `DEFAULT_GUILD_FEATURES`.
- Canales: `readChannels`/`writeChannels` (mutador funcional), `setCoreChannel`, `getCoreChannel`, `setTicketCategory`, `setTicketMessage`.
- Canales gestionados: `listManagedChannels`, `addManagedChannel`, `updateManagedChannel`, `removeManagedChannel` (genera claves a partir del label).
- Tickets pendientes: `getPendingTickets`, `setPendingTickets` (sanitiza y deduplica).
- Roles de guild: `readRoles`, `writeRoles`, `getRole`, `updateRole`, `removeRole`, `ensureRoleExists`.
- Overrides y límites: `getRoleOverrides`, `setRoleOverride`, `clearRoleOverride`, `resetRoleOverrides`, `getRoleLimits`, `setRoleLimit`, `clearRoleLimit`.

### `repositories/with_guild.ts`

- Patrón funcional legacy para mutar un documento completo de guild: `withGuild(id, callback)` crea si no existe, ejecuta el callback sobre una copia y persiste el resultado.
- Uso recomendado para configuraciones de baja concurrencia (dashboard). Para contadores atomicos usar `repositories/guilds.ts`.

### `repositories/autorole.ts`

- Reglas: fetch/list/insert/upsert/updateEnabled/delete con triggers discriminados; IDs compuestos `guildId:name`.
- Grants: upsert/delete/list/find/purge; IDs compuestos `guildId:userId:roleId:ruleName:type`.
- Tallies: increment/decrement/read/list/delete con `_id = guildId:messageId:emojiKey`.

### `repositories/offers.ts`

- `createOffer` (falla con `ACTIVE_OFFER_EXISTS` en duplicados activos), `findById`, `findActiveByAuthor`, `updateOffer` (con guardas opcionales de estado), `listByStatus`, `removeOffer`.

### `repositories/tops.ts`

- Configuración/ventana: `ensureTopWindow`, `getTopWindow`, `updateTopConfig`, `resetTopWindow`.
- Contadores: `bumpEmojiCounts`, `bumpChannelCount`, `bumpReputationDelta`.
- Scheduler: `findDueWindows`.
- Reportes: `persistTopReport`, `rotateWindowAfterReport`, `listReports`.

## Cómo extender la capa de datos

- Nuevos campos: agrega el campo al schema Zod correspondiente en `src/db/schemas/*` con `default` si aplica. Considera si necesitas un índice (usa `createIndex`/`updateMany` ad hoc).
- Validación: deja que los repos `parse`en lecturas/escrituras con Zod; no dupliques shape en tipos sueltos.
- Nuevos repos o métodos: usa `getDb().collection(...)`, operaciones atómicas (`$inc`, `findOneAndUpdate`) y devuelve datos ya validados.
- Cambios de estructura (renombrar campos, mover colecciones): escribe scripts/migraciones dedicadas; la validación de Zod no cubre migraciones históricas.

## Desarrollo local

- Configura `MONGO_URI` apuntando a tu instancia (local o contenedor). Usa `DB_NAME` para aislar bases por desarrollador (default `pyebot`).
- `getDb()` se inicializa en el bootstrap; no necesitas abrir conexiones en los módulos de negocio.
