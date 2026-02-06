/**
 * Purpose: Block commands when a bound feature flag is disabled.
 * Context: Global middleware; commands opt-in via @BindDisabled.
 * Dependencies: Feature config store, feature decorator, guild ID helpers.
 * Invariants:
 * - Only commands decorated with @BindDisabled are affected.
 * - Feature checks are guild-scoped; DMs bypass.
 * Gotchas:
 * - stop() triggers onMiddlewaresError; commands with custom handlers must avoid double replies.
 */
import { createMiddleware } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { isFeatureEnabled } from "@/modules/features";
import { getBoundFeature } from "@/modules/features/decorator";
import { extractGuildId } from "@/utils/commandGuards";

/**
 * Middleware that enforces feature availability.
 *
 * Side effects: Sends an ephemeral denial message when disabled.
 */
export const featureToggleMiddleware = createMiddleware<void>(
  async ({ context, next, stop }) => {
    const boundFeature = getBoundFeature(
      (context as { command?: unknown })?.command,
    );
    if (!boundFeature) return next();

    const guildId = extractGuildId(context);
    if (!guildId) return next();

    const enabled = await isFeatureEnabled(guildId, boundFeature);
    if (enabled) return next();

    await context.write({
      content: `This feature (\`${boundFeature}\`) is disabled in this server. An administrator can enable it from the dashboard.`,
      flags: MessageFlags.Ephemeral,
    });

    return stop("Feature disabled");
  },
);
