/**
 * @HelpDoc Decorator.
 *
 * Purpose: Attach help metadata to a command class and self-register it in the
 * global helpRegistry at module load time — no manual wiring required.
 *
 * Concept: Mirrors the @BindDisabled pattern. The decorator stamps a
 * `__helpEntry` property on the prototype for optional runtime inspection and
 * immediately calls helpRegistry.register() so the entry is available as soon
 * as the command file is imported (which Seyfert already does via @AutoLoad).
 *
 * Scope: Pure metadata + side-effect registration. No Discord dependencies.
 *
 * @example
 * ```typescript
 * @HelpDoc({
 *   command: "work",
 *   category: HelpCategory.Economy,
 *   description: "Earn a small payout from the guild work sector",
 *   usage: "/work",
 * })
 * @Declare({ name: "work", description: "..." })
 * export default class WorkCommand extends Command { ... }
 * ```
 */
import { helpRegistry, type HelpEntryData } from "./registry";

/** Shape stamped onto the prototype for optional runtime access. */
export interface HelpBoundCommand {
  __helpEntry?: HelpEntryData;
}

type HelpBoundConstructor = {
  prototype: HelpBoundCommand;
};

/**
 * Class decorator that registers a command's help metadata.
 *
 * @param entry - Help metadata for the command. See {@link HelpEntryData}.
 * @returns A class decorator that stamps `__helpEntry` and registers the entry.
 */
export function HelpDoc(entry: HelpEntryData): ClassDecorator {
  return (target) => {
    (target as HelpBoundConstructor).prototype.__helpEntry = entry;
    helpRegistry.register(entry);
  };
}

/**
 * Retrieve the help entry stamped on a command instance, if any.
 * Useful for runtime inspection or debugging.
 */
export function getHelpEntry(command: unknown): HelpEntryData | undefined {
  if (!command || typeof command !== "object") return undefined;
  return (command as HelpBoundCommand).__helpEntry;
}
