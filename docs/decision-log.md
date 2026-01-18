# Decision Log

## 2025-12-23 - Config registry owns storage paths + explicit schema loader
- Change: `defineConfig` now registers both schema and storage path; provider resolves paths from the registry. Config schemas are explicitly loaded via `src/configuration/register.ts`.
- Reason: reduce duplicated path maps and avoid implicit load-order bugs.
- Alternatives discarded: keep `CONFIG_PATHS` in provider; rely on command side-effects for schema registration.
- Risks/impact: missing imports lead to empty configs and no-op writes; path mismatches degrade to defaults.
- Verify: start bot, call a config command (AI/forum/tickets/offers), and confirm values persist and read back.

## 2025-12-23 - Feature flags routed through ConfigStore
- Change: `modules/features` now reads/writes via `configStore` (single cache) and no longer maintains `featureCache`.
- Reason: avoid duplicate caches and unify config behavior across the codebase.
- Alternatives discarded: keep featureCache as a second layer.
- Risks/impact: relies on ConfigStore cache TTL; missing config schema would default to all enabled.
- Verify: toggle a feature via command/dashboard and confirm `isFeatureEnabled` reflects the change within one cache TTL.

## 2026-01-13 - Documented optimistic transition contracts
- Change: Added invariants/risks headers + docstrings for `atomicTransition`, `runUserTransition`, and `MongoStore` to spell out CAS expectations and default behaviors.
- Reason: Avoid misuse of snapshots (e.g., non-deterministic fields) and hidden fallback defaults that mask corrupt documents.
- Alternatives discarded: Leave terse comments and rely on callers to inspect implementations.
- Risks/impact: Docs call out that lenient parsing can hide schema issues; teams should monitor logs if defaults get applied.
- Verify: run any user reputation adjustment path or `UserStore.ensure` in a dev shell and confirm operations return `Result` success without altering unrelated fields.

## 2026-01-13 - Clarified cooldown + guild logging responsibilities
- Change: Documented cooldown manager/resource invariants (key format, return semantics when denying, gateway cache scope) and GuildLogger channel resolution/fallback behavior.
- Reason: prevent misinterpreting `use` return values, and avoid silent loss of logs when channels vanish or fallbacks are missing.
- Alternatives discarded: embed docs in external guide; kept inline where the invariants are enforced.
- Risks/impact: callers must treat numeric responses from cooldowns as denials; missing fallback IDs still drop logs.
- Verify: invoke a command with cooldown metadata and observe numeric wait time on exhaustion; simulate a deleted log channel and confirm it is cleared from `channels.core`.

## 2026-01-13 - Documented ticket lifecycle and channel cleanup contracts
- Change: Added inline docs for ticket prompt deduplication, open/close ordering, transcriptions, channel guard behavior, and guild channel cleanup defaults.
- Reason: make explicit why the system keeps a single prompt per guild, creates channels before persisting, cleans broken routes, and generates transcripts before deletion.
- Alternatives discarded: leave terse comments and rely on code reading.
- Risks/impact: docs highlight that heavy transcriptions can be costly, channel default shapes diverge across schemas, and feature flags/config drift still require monitoring.
- Verify: run `ensureTicketMessage`, open a ticket, close it via the button, and confirm pendingTickets/openTickets are cleared and (if configured) a transcript reaches the logs channel.

## 2026-01-18 - Simplified cooldowns and unified response path
- Change: Replaced token-bucket + gateway cache cooldowns with a monotonic in-memory map and a single middleware response path. Documented the new invariants.
- Reason: Cooldowns never reset and the warning message was emitted twice due to double middleware execution and token accounting.
- Alternatives discarded: keep token bucket and add cleanup timers; keep gateway cache for cross-shard sync.
- Risks/impact: cooldowns are process-local (not shared across shards); penalties must reference the exact command name.
- Verify: invoke a cooldowned command twice quickly (second blocked once), then wait the interval and invoke again (allowed).

## 2026-01-18 - Documented middleware pipeline and guard/limit contracts
- Change: Added consistent headers and JSDoc for global middlewares, bootstrap, and guard/limit logic.
- Reason: Middleware order and denial paths are easy to break without explicit invariants.
- Alternatives discarded: keep comments local to functions or rely on external docs.
- Risks/impact: documentation now asserts ordering and scope assumptions; changes to middleware order must update docs.
- Verify: invoke a guarded command in DM (expect guild-only message), disable a feature (expect feature denial), and hit a moderation limit (expect limit embed).
