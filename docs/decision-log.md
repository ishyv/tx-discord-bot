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
