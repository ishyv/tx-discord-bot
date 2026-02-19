/**
 * Help Module Index.
 *
 * Purpose: Public API for the help system. Import from here to access the
 * registry, decorator, category metadata, and types.
 *
 * Usage:
 * ```typescript
 * import { HelpDoc, HelpCategory, helpRegistry } from "@/modules/help";
 * ```
 */
export { HelpDoc, getHelpEntry } from "./decorator";
export type { HelpBoundCommand } from "./decorator";

export {
  HelpCategory,
  CATEGORY_META,
  helpRegistry,
  HelpRegistry,
} from "./registry";
export type { HelpEntryData, CategoryMeta } from "./registry";
