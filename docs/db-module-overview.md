# DB Module Overview (Mongo Driver + Zod)

Intent: describe how the persistence layer is structured, how to use it safely, and how to extend it without re‑inventing helpers. This complements `docs/database.md` with a narrative of the moving parts and conventions.

## Pillars
- **Single source of truth:** Every entity shape lives in a Zod schema under `src/db/schemas`. Types are inferred from those schemas.
- **Thin repositories:** `src/db/repositories/*` wrap the native Mongo driver. They validate inputs/outputs with Zod and expose domain‑centric functions (insert/find/update/delete + domain queries).
- **Minimal client surface:** `src/db/mongo.ts` provides `getDb()` / `disconnectDb()`. Do not create ad‑hoc clients elsewhere.
- **No fixers/mappers:** There is no `fixDb` or Mongoose models. Defaults and normalization come from the Zod schemas and repo logic.

## Layout
- `src/db/mongo.ts` — MongoClient singleton; reads `MONGO_URI` and `DB_NAME` (default `pyebot`).
- `src/db/schemas/*.ts` — Zod schemas and exported types. Apply defaults here.
- `src/db/repositories/*.ts` — Per‑entity data access. Each file owns one domain (users, guilds, autorole, offers, tops).
- `src/db/helpers.ts` / `normalizers.ts` — Pure utilities (deep clone, list/date/number helpers).
- `src/db/index.ts` — Re‑exports to keep imports concise.

## Schemas at a glance
- `user.ts`: `_id` is Discord userId; fields for `rep`, `warns`, `openTickets`, flexible `currency`/`inventory` records; optional timestamps.
- `guild.ts`: `_id` is Discord guildId; `roles`, `channels` (core/managed), `features`, `pendingTickets`, `reputation.keywords`; optional timestamps.
- `autorole.ts`: rules (`autorole_rules`, `_id = guildId:name`, discriminated `trigger`), grants (`autorole_role_grants`, `_id = guildId:userId:roleId:ruleName:type`), tallies (`autorole_reaction_tallies`, `_id = guildId:messageId:emojiKey`).
- `offers.ts`: `_id = offerId`; status enum; `details`, stored `embed`, review/publish message/channel refs, moderator notes.
- `tops.ts`: active window (`_id = guildId`, counts/maps, interval/top size defaults), historical reports snapshots.

## Repository conventions
- **Always validate:** Parse DB reads and user inputs with the matching Zod schema before returning.
- **Return POJOs:** No driver objects or cursors leave the repo; everything is plain JS/TS objects typed from Zod.
- **Atomic updates:** Use `$set`, `$inc`, `findOneAndUpdate` with guards/upserts for counters and uniqueness.
- **Key strategy:** Prefer string keys, often composite (`guildId:name`, `guildId:userId:roleId:ruleName:type`). Avoid ObjectId.
- **Naming:** Methods read like intent (`ensureTopWindow`, `adjustUserReputation`, `setCoreChannel`, `createOffer`), not driver ops.

## Common ops by repo
- `users.ts`: `findUser`/`ensureUser`/`saveUser`, reputation helpers, warn helpers, ticket helpers, CAS helpers for currency/inventory.
- `guilds.ts`: ensure/read/update guild, features, core/managed channels, pending tickets, managed roles, limits/overrides.
- `autorole.repo.ts`: rules CRUD/upsert/enabled toggle; grants upsert/delete/list/purge; tallies increment/decrement/read.
- `offers.ts`: create/find/update/list/remove with status guards and duplicate prevention.
- `tops.ts`: ensure/get/update config, reset/rotate windows, bump counts, find due windows, persist/list reports.

## Adding or changing an entity
1) **Shape:** Add/modify the Zod schema in `src/db/schemas/<entity>.ts`; include defaults. Export the inferred type.
2) **Repo:** Add/extend a repo in `src/db/repositories/<entity>.ts`. Validate inputs, parse outputs, and keep functions small.
3) **Callers:** Import the repo functions and schema types; avoid direct `getDb()` usage outside repos.
4) **IDs:** Pick stable string keys; add helper `key` builders in the repo when composite.
5) **Docs:** Add a short note in this file or `docs/database.md` if the entity is user‑facing.

## Error handling & safety
- Repos throw or return domain errors (e.g., `ACTIVE_OFFER_EXISTS`). They never leak driver errors directly.
- Validation failures happen at the boundary (Zod parse). Defaults are applied there too.
- Connection is centralized; no per‑call client creation. `getDb()` memoizes MongoClient + Db.

## Patterns to reuse
- **Upsert with validation:** `findOneAndUpdate(..., { returnDocument: "after", upsert: true })` + fallback `findOne` + Zod parse.
- **Counters/maps:** `$inc` with dotted paths for maps (`emojiCounts.<key>`), `$setOnInsert` for defaults.
- **Functional updates:** For complex objects (guild config), prefer mutator functions or dedicated repo helpers instead of manual object spreads in callers.

## Anti‑patterns to avoid
- Bypassing repos to hit `getDb().collection(...)` from business logic.
- Duplicating shapes in ad‑hoc interfaces; always derive from the Zod schema.
- Relying on runtime “fixers” to patch documents; use schema defaults and explicit migrations when structures change.

## Runtime lifecycle
- `src/index.ts` calls `getDb()` on bootstrap to warm the connection once.
- Tests or shutdown paths can call `disconnectDb()` if needed; the rest of the app should not manage the client directly.
