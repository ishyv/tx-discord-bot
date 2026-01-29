/**
 * Economy Module Initialization (Phase 2).
 *
 * Coordinates initialization of all economy subsystems:
 * - Account repository (with indexes)
 * - Audit repository (with indexes)
 * - Services
 */

import { ensureAuditIndexes } from "./audit/repository";

let initialized = false;

export async function initEconomyModule(): Promise<void> {
  if (initialized) {
    return;
  }

  // Initialize repositories with indexes
  // (Account repo is lazy-initialized on first use)
  await ensureAuditIndexes();

  initialized = true;
}

export function isEconomyModuleInitialized(): boolean {
  return initialized;
}
