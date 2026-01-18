/**
 * Purpose: Attach guard metadata to command classes.
 * Context: Read by guard middleware before command execution.
 * Dependencies: Seyfert permissions types only.
 * Invariants:
 * - Metadata is stored on the command instance (`__guard`).
 * - The guard middleware must read the same shape.
 * Gotchas:
 * - If a command is wrapped or proxied, metadata may be lost.
 */
import type { PermissionStrings } from "seyfert";

export interface GuardMetadata {
  /** true when the command must run inside a guild. */
  guildOnly?: boolean;
  /** Discord permissions required for execution. */
  permissions?: PermissionStrings | bigint;
  /** Custom action key used for role-override rules. */
  actionKey?: string;
  /** Feature flag name to check before execution. */
  feature?: string;
}

export interface GuardedCommand {
  __guard?: GuardMetadata;
}

/**
 * Decorator that attaches guard configuration to a command class.
 *
 * Params:
 * - metadata: guard configuration used by guardMiddleware.
 *
 * Side effects: Mutates the command prototype by setting `__guard`.
 */
export function Guard(metadata: GuardMetadata): ClassDecorator {
  return (target) => {
    (target as any).prototype.__guard = metadata;
  };
}

/**
 * Read guard metadata from a command instance.
 *
 * Returns: GuardMetadata or null when not configured.
 */
export function getGuardMetadata(command: any): GuardMetadata | null {
  return command?.__guard ?? null;
}
