/**
 * Purpose: Central registry for all Seyfert middlewares used by the client.
 * Context: Imported by the bot entrypoint to register middleware services.
 * Dependencies: Individual middleware modules only.
 * Invariants:
 * - Keys here must match the names referenced in globalMiddlewares and @Middlewares.
 * - Order is enforced by the client config, not by this file.
 * Gotchas:
 * - Renaming a key silently disables that middleware at runtime.
 */
import CooldownMiddleware from "./cooldown";
import { featureToggleMiddleware } from "./featureToggle";
import { moderationLimit } from "./moderationLimit";
import { guardMiddleware } from "./guards/middleware";

export const middlewares = {
  cooldown: CooldownMiddleware,
  moderationLimit,
  featureToggle: featureToggleMiddleware,
  guard: guardMiddleware,
};
