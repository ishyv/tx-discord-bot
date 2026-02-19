/**
 * Help Registry.
 *
 * Purpose: Central store for command help metadata. Commands self-register at
 * import time via the @HelpDoc decorator, so no manual wiring is required.
 *
 * Concept: A module-level singleton Map keyed by command name. The decorator
 * stamps entries at decoration time; the /help command reads them at runtime.
 *
 * Scope: Pure data layer — no Discord or Seyfert dependencies.
 */

// ============================================================================
// CATEGORY DEFINITIONS
// ============================================================================

/**
 * Canonical category enum for all bot commands.
 * Add new values here when introducing a new command group.
 */
export enum HelpCategory {
  Economy = "economy",
  RPG = "rpg",
  Moderation = "moderation",
  Fun = "fun",
  Game = "game",
  Utility = "utility",
  AI = "ai",
  Offers = "offers",
}

/** Display metadata for each category, used by the /help UI. */
export interface CategoryMeta {
  /** Short emoji prefix shown in embeds and buttons. */
  emoji: string;
  /** Human-readable label. */
  label: string;
  /** One-line tagline shown on the home screen. */
  tagline: string;
}

/**
 * Static display metadata for every HelpCategory.
 * Extend this record whenever a new HelpCategory value is added.
 */
export const CATEGORY_META: Readonly<Record<HelpCategory, CategoryMeta>> = {
  [HelpCategory.Economy]: {
    emoji: "💰",
    label: "Economy",
    tagline: "Currency, work, transfers, market, and more",
  },
  [HelpCategory.RPG]: {
    emoji: "⚔️",
    label: "RPG",
    tagline: "Character profile, equipment, crafting, and combat",
  },
  [HelpCategory.Moderation]: {
    emoji: "🛡️",
    label: "Moderation",
    tagline: "Bans, warns, roles, tickets, and server management",
  },
  [HelpCategory.Fun]: {
    emoji: "🎉",
    label: "Fun",
    tagline: "Jokes, games, and entertainment",
  },
  [HelpCategory.Game]: {
    emoji: "🎮",
    label: "Game",
    tagline: "Inventory management and in-game items",
  },
  [HelpCategory.Utility]: {
    emoji: "🔧",
    label: "Utility",
    tagline: "Suggestions and general server utilities",
  },
  [HelpCategory.AI]: {
    emoji: "🤖",
    label: "AI",
    tagline: "AI provider and model configuration",
  },
  [HelpCategory.Offers]: {
    emoji: "📋",
    label: "Offers",
    tagline: "Moderated job offer management",
  },
};

// ============================================================================
// HELP ENTRY DATA
// ============================================================================

/**
 * All metadata that can be attached to a command via @HelpDoc.
 *
 * Only `command`, `category`, and `description` are required.
 * All other fields are optional enrichment shown in the detail view.
 */
export interface HelpEntryData {
  /**
   * Full slash command name as Discord knows it.
   * For top-level commands use the name directly (e.g. `"work"`).
   * For subcommands use space-separated path (e.g. `"rpg equipment"`).
   */
  command: string;

  /** Category this command belongs to. */
  category: HelpCategory;

  /**
   * One-line description shown in the category listing.
   * Keep it under ~80 characters so it fits cleanly in an embed field.
   */
  description: string;

  /**
   * Usage pattern shown in the detail view.
   * Use angle brackets for required args and square brackets for optional.
   * Example: `"/transfer <currency> <amount> <user>"`
   */
  usage?: string;

  /**
   * Concrete invocation examples.
   * Example: `["/work", "/work"]`
   */
  examples?: string[];

  /**
   * Discord permission names required to run this command.
   * Example: `["BanMembers"]`
   */
  permissions?: string[];

  /**
   * Extra context, caveats, or tips shown at the bottom of the detail view.
   * Supports markdown.
   */
  notes?: string;
}

// ============================================================================
// REGISTRY SINGLETON
// ============================================================================

/**
 * Global help registry.
 *
 * Commands register themselves at decoration time by calling `register()`.
 * The /help command reads entries via `getAll()`, `getByCategory()`, etc.
 *
 * Invariants:
 * - Keys are lower-cased command names to avoid duplicates from casing.
 * - Registering the same key twice overwrites the previous entry (last-write wins).
 */
export class HelpRegistry {
  private readonly entries = new Map<string, HelpEntryData>();

  /**
   * Register a help entry.
   * Called automatically by @HelpDoc at decoration time.
   */
  register(entry: HelpEntryData): void {
    this.entries.set(entry.command.toLowerCase(), entry);
  }

  /**
   * Retrieve a single entry by its command name.
   * Returns `undefined` if not registered.
   */
  get(command: string): HelpEntryData | undefined {
    return this.entries.get(command.toLowerCase());
  }

  /**
   * All registered entries, sorted alphabetically by command name.
   */
  getAll(): HelpEntryData[] {
    return [...this.entries.values()].sort((a, b) =>
      a.command.localeCompare(b.command),
    );
  }

  /**
   * All entries belonging to the given category, sorted alphabetically.
   */
  getByCategory(category: HelpCategory): HelpEntryData[] {
    return this.getAll().filter((e) => e.category === category);
  }

  /**
   * All categories that have at least one registered entry, in enum order.
   */
  getPopulatedCategories(): HelpCategory[] {
    const populated = new Set(this.getAll().map((e) => e.category));
    return Object.values(HelpCategory).filter((c) => populated.has(c));
  }

  /**
   * Number of entries registered for a given category.
   */
  countByCategory(category: HelpCategory): number {
    return this.getByCategory(category).length;
  }

  /** Total number of registered entries. */
  get size(): number {
    return this.entries.size;
  }
}

/** Shared singleton instance used by @HelpDoc and the /help command. */
export const helpRegistry = new HelpRegistry();
