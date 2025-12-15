DB refactor notes (working branch: db-test)
===========================================

Current map (post-migration)
----------------------------
- Connection: native driver via `src/db/mongo.ts` (`getDb` singleton) initialized in `src/index.ts`.
- Schemas: Zod in `src/db/schemas/{user,guild,autorole,offers,tops}.ts` (single source of truth with defaults).
- Repositories: native driver + Zod in `src/db/repositories/{users,guilds,autorole,offers,tops}.ts`; legacy `with_guild.ts` wraps the guild repo; autorole cache/service/presets remain.
- Helpers: `src/db/helpers.ts` (deepClone), `src/db/normalizers.ts` (pure utils).
- Entrypoint re-exports: `src/db/index.ts` exposes schemas, repos, mongo helper.

Pain points addressed
---------------------
- Eliminated Mongoose usage, models, and fixDb; connection centralized via MongoClient singleton.
- Schemas defined once via Zod; repos validate reads/writes consistently.
- Call sites updated off direct model usage (users, guilds, autorole, offers, tops).

Work done (db-test)
-------------------
- Added native Mongo client (`src/db/mongo.ts`) and Zod schemas for all entities.
- Users/guilds/autorole/offers/tops repos rewritten to native driver + Zod; legacy `with_guild` kept for compatibility.
- Inventory/economy transactions use CAS helpers in users repo (no direct DB access).
- Removed Mongoose models, client, base-repo, store, fixDb, and autorole mappers.

Stage 0 (inventory for Mongoose → Mongo native + Zod)
-----------------------------------------------------
- Mongoose touchpoints:
  - Connection: `src/db/mongo.ts` (MongoClient singleton) — replaces `connectMongo`.
  - Schemas: `src/db/schemas/*.ts` (Zod) — replaces `src/db/models/*.schema.ts`.
  - Helpers: `src/db/helpers.ts`, `src/db/normalizers.ts`.
  - Repos: native driver in `src/db/repositories/{users,guilds,autorole,offers,tops}.ts`; compatibility wrapper `with_guild.ts`.
  - Domain modules now import repos/schemas, not models.
- Dependency: `mongodb`; `mongoose` removed.

Stage 1 progress (Mongo native + Zod scaffolding)
-------------------------------------------------
- Added native Mongo client helper `src/db/mongo.ts` exposing `getDb()` / `disconnectDb()` using env URI/DB name.
- Added Zod schemas with defaults:
  - Users: `src/db/schemas/user.ts`
  - Guilds: `src/db/schemas/guild.ts`
  - Autorole (rules/grants/tallies + discriminated triggers): `src/db/schemas/autorole.ts`
  - Offers: `src/db/schemas/offers.ts`
  - Tops: `src/db/schemas/tops.ts`
- Exported Mongo helper and schemas via `src/db/index.ts` for gradual adoption.

Stage 2 progress (users on native driver + Zod)
-----------------------------------------------
- Rewrote `src/db/repositories/users.ts` to use Mongo native driver + Zod validation; added optimistic CAS helpers for inventory/currency; preserved exported API (ensure/find/save/delete, reputation, warns/tickets) plus a compatibility `toUser` parser.
- Updated inventory and economy transactions to use repo CAS helpers instead of direct `UserModel`/mongoose access; added module docstrings.
- Added docstrings to new schema modules and Mongo helper per documentation requirement.

Stage 3 progress (guilds + autorole on native driver + Zod)
-----------------------------------------------------------
- Replaced guild persistence with native driver + Zod (`src/db/repositories/guilds.ts`), updated legacy `with_guild` wrapper, and swapped config provider to use the repo.
- Updated feature/guild roles/channels modules to import types/enums from Zod schemas instead of Mongoose models.
- Migrated autorole repo to native driver + Zod (`src/db/repositories/autorole.repo.ts`), removed mappers, and aligned autorole types to Zod schema.

Stage 3 continued (offers + tops, cleanup)
------------------------------------------
- Migrated offers repo to native driver + Zod (`src/db/repositories/offers.ts`); offers types now derive from schemas.
- Migrated tops repo to native driver + Zod (`src/db/repositories/tops.ts`); TOP defaults centralized in schema; commands adjusted.
- Removed Mongoose client, schemas, base repo, store, fixDb, and model exports; `mongoose` dependency dropped.
