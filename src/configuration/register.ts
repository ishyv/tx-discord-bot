/**
 * Explicit config schema loader.
 *
 * WHY: config registration is side-effectful; this file centralizes imports so
 * the runtime never depends on implicit load order from commands/listeners.
 *
 * RISK: if a module's config file is not imported here, its schema/path will be
 * missing and ConfigStore will fall back to empty defaults.
 */
// Explicitly load config schemas so runtime does not depend on implicit side effects.
import "@/commands/ai/config";
import "@/commands/automod/config";
import "@/commands/moderation/forums/config";
import "@/commands/moderation/rep/config";
import "@/commands/moderation/tickets/config";
import "@/commands/offers/config";
import "@/modules/features/config";
