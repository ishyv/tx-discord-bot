/**
 * Purpose: Enforce command cooldowns before execution.
 * Context: Global middleware in Seyfert's pipeline.
 * Dependencies: CooldownManager on the client; Seyfert formatter for timestamps.
 * Invariants:
 * - Executes at most once per invocation (even if registered globally and locally).
 * - Emits exactly one cooldown response when blocked.
 * Gotchas:
 * - Uses pass() instead of stop() to avoid onMiddlewaresError side effects.
 */
import { createMiddleware, Formatter } from "seyfert";
import { TimestampStyle } from "seyfert/lib/common";

// WHY: Prevent duplicate cooldown evaluation when middleware is both global and local.
const COOLDOWN_MARK = Symbol("cooldownChecked");

export default createMiddleware<void>(async ({ context, next, pass }) => {
  const state = context as unknown as Record<string | symbol, unknown>;
  if (state[COOLDOWN_MARK]) return next();
  state[COOLDOWN_MARK] = true;

  const inCooldown = context.client.cooldown.context(context);

  if (typeof inCooldown === "number") {
    const remainingMs = Math.max(0, Math.ceil(inCooldown));
    await context.write({
      content: `Estas usando un comando muy seguido, intenta nuevamente en ${Formatter.timestamp(new Date(Date.now() + remainingMs), TimestampStyle.RelativeTime)}`,
    });
    // WHY: pass() stops the chain without triggering onMiddlewaresError.
    return pass();
  }

  return next();
});
