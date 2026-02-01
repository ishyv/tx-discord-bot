/**
 * Economy Moderation Module (Phase 10c).
 *
 * Purpose: Moderation tools for economy triage (freeze, unfreeze, peek).
 */

export { economyModerationService } from "./service";
export { economyModerationRepo, ensureModerationIndexes } from "./repository";

export {
  isAccountFrozen,
  getRemainingFreezeHours,
  formatFreezeDuration,
  MAX_FREEZE_HOURS,
  DEFAULT_AUDIT_LIMIT,
  MAX_AUDIT_LIMIT,
} from "./types";

export type {
  EconomyFreeze,
  FreezeAccountInput,
  UnfreezeAccountInput,
  FreezeOperationResult,
  EconomyPeekResult,
  ModerationAuditQuery,
  ModerationActionType,
} from "./types";
