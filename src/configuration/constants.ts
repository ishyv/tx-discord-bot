/**
 * Canonical keys for per-guild configuration.
 *
 * Role in system:
 * - Shared enum used by config registration, the store, and callers.
 *
 * Invariants:
 * - Keys are stable public identifiers; renaming breaks stored data.
 * - Each key should be registered with defineConfig (schema + path).
 *
 * Gotchas:
 * - If a key is not registered, ConfigStore returns {} and logs a warning.
 */
export enum ConfigurableModule {
    AI = "ai",
    Reputation = "reputation",
    Features = "features",
    Tops = "tops",
    ForumAutoReply = "forumAutoReply",
    ChannelsCore = "channels.core",
    ChannelsManaged = "channels.managed",
    Tickets = "tickets",
    Offers = "offers",
}
