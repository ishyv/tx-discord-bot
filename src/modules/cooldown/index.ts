/**
 * Purpose: Export cooldown primitives and the decorator used by commands.
 * Context: Commands import from this module to attach cooldown metadata.
 * Dependencies: CooldownManager (reads the metadata at runtime).
 * Invariants:
 * - The decorator only adds metadata; enforcement happens in middleware.
 * - Props must be stable to keep consistent keying and behavior.
 * Gotchas:
 * - If a command omits the cooldown middleware, the metadata is inert.
 */
import type { CooldownProps } from "./manager";

export * from "./manager";

/**
 * Attach cooldown metadata to a command class.
 *
 * Params:
 * - props: cooldown config (scope, interval, uses).
 *
 * Returns: A subclass that exposes `cooldown` for the manager to read.
 *
 * Side effects: None (pure metadata). No enforcement occurs here.
 *
 * Example:
 * @Cooldown({ type: CooldownType.User, interval: 5000, uses: { default: 1 } })
 * class ExampleCommand extends Command {}
 */
export function Cooldown(props: CooldownProps) {
  return <T extends new (...args: any[]) => {}>(target: T) =>
    class extends target {
      cooldown = props;
    };
}
