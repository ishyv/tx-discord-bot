/**
 * Economy Initialization Listener.
 *
 * Purpose: Set up economy system on bot startup.
 * - Ensures audit collection indexes
 * - Future: cache warming, scheduled tasks, etc.
 */

import { onBotReady } from "@/events/hooks/botReady";
import { ensureAuditIndexes } from "@/modules/economy/audit/repository";

onBotReady(async (_user, client) => {
  client.logger.info("[Economy] Initializing economy system...");

  try {
    // Ensure audit collection indexes exist
    await ensureAuditIndexes();
    client.logger.info("[Economy] Audit indexes ensured");
  } catch (error) {
    client.logger.error("[Economy] Failed to initialize:", error);
    // Don't crash - economy can still function without indexes (just slower)
  }
});
