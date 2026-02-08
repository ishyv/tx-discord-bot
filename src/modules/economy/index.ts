/**
 * Economy Module Public API (Phase 2: Mutation System).
 *
 * Note: Exporting only what's needed by other modules and commands.
 */

// -------------------------------------------------------------------------
// Account Management (includes formatting, views, and types)
// -------------------------------------------------------------------------
export * from "./account";

// -------------------------------------------------------------------------
// View Builders (re-export for convenience)
// -------------------------------------------------------------------------
export * from "./views";
export * from "./progression";

// -------------------------------------------------------------------------
// Audit Logging
// -------------------------------------------------------------------------
export { economyAuditRepo } from "./audit/repository";
export type {
  AuditQuery,
  AuditQueryResult,
} from "./audit/types";

// -------------------------------------------------------------------------
// Mutations (Currency + Items)
// -------------------------------------------------------------------------
export {
  currencyMutationService,
  itemMutationService,
} from "./mutations";

export type {
  AdjustCurrencyBalanceInput,
  AdjustCurrencyBalanceResult,
  CurrencyMutationError,
  CurrencyMutationErrorCode,
  TransferCurrencyInput,
  TransferCurrencyResult,
  AdjustItemQuantityInput,
  AdjustItemQuantityResult,
  ItemMutationError,
  ItemMutationErrorCode,
  CapacityStats,
} from "./mutations";

// -------------------------------------------------------------------------
// Guild Economy (Phase 2d)
// -------------------------------------------------------------------------
export {
  guildEconomyRepo,
  guildEconomyService,
  calculateTax,
  checkTransferThreshold,
  buildTransferAlertMessage,
} from "./guild";

// -------------------------------------------------------------------------
// Daily Claim (Phase 3b)
// -------------------------------------------------------------------------
export {
  dailyClaimRepo,
  computeDailyStreakBonus,
  buildDailyClaimAuditMetadata,
  dailyService,
} from "./daily";

// -------------------------------------------------------------------------
// Work Claim (Phase 3d)
// -------------------------------------------------------------------------
export { workClaimRepo } from "./work";
export { workService } from "./work/service";

// -------------------------------------------------------------------------
// Perks (Phase 3)
// -------------------------------------------------------------------------
export * from "./perks";

// -------------------------------------------------------------------------
// Equipment (Phase 4)
// -------------------------------------------------------------------------
export * from "./equipment";

// -------------------------------------------------------------------------
// Crafting (Phase 5)
// -------------------------------------------------------------------------
export * from "./crafting";

// -------------------------------------------------------------------------
// Minigames (Phase 6)
// -------------------------------------------------------------------------
export * from "./minigames";

// -------------------------------------------------------------------------
// Voting (Phase 7)
// -------------------------------------------------------------------------
export * from "./voting";

// -------------------------------------------------------------------------
// Rollback tooling (Phase 3e)
// -------------------------------------------------------------------------
export { rollbackByCorrelationId } from "./rollback";
export type { RollbackInput, RollbackResult } from "./rollback";

export type {
  EconomySector,
  SectorBalances,
  TaxConfig,
  TaxResult,
  TransferThresholds,
  TransferAlertLevel,
  LargeTransferAlert,
  TaxableOperationType,
  DepositToSectorInput,
  WithdrawFromSectorInput,
  SectorBalanceResult,
  DailyConfig,
  WorkConfig,
  GuildEconomyConfig,
  GuildEconomyError,
  GuildEconomyErrorCode,
} from "./guild";

export {
  DEFAULT_TAX_CONFIG,
  DEFAULT_TRANSFER_THRESHOLDS,
  DEFAULT_SECTOR_BALANCES,
  DEFAULT_DAILY_CONFIG,
  DEFAULT_WORK_CONFIG,
} from "./guild";

// -------------------------------------------------------------------------
// Store (Phase 2e)
// -------------------------------------------------------------------------
export {
  storeRepo,
  storeService,
  calculateSellPrice,
  calculateBuyPrice,
  calculatePriceWithTax,
  checkStock,
  buildDefaultCatalog,
} from "./store";

export type {
  StoreItem,
  StoreCatalog,
  BuyItemInput,
  BuyItemResult,
  SellItemInput,
  SellItemResult,
  StockCheckResult,
  PriceCalculation,
  StoreError,
  StoreErrorCode,
  StoreTransactionAudit,
} from "./store";

export { DEFAULT_STORE_CONFIG } from "./store";

// -------------------------------------------------------------------------
// Validation & Permissions
// -------------------------------------------------------------------------
export { sanitizeCurrencyId } from "./mutations/validation";
export { sanitizeItemId } from "./mutations/items/validation";
export {
  EconomyPermissionLevel,
  checkEconomyPermission,
  createEconomyPermissionChecker,
} from "./permissions";

// -------------------------------------------------------------------------
// Legacy Transactions (for backward compatibility)
// -------------------------------------------------------------------------
export { currencyTransaction } from "./transactions";

// -------------------------------------------------------------------------
// Database Index Management
// -------------------------------------------------------------------------
export {
  ensureAllEconomyIndexes,
  ensureDailyClaimsIndexes,
  ensureWorkClaimsIndexes,
  ensureVotingIndexes,
  ensureMinigameStateIndexes,
  ensurePerkStateIndexes,
  ensureEquipmentIndexes,
  ensureCraftingIndexes,
  ensureStoreIndexes,
  ensureMarketIndexes,
  getEconomyIndexStats,
  TTLConfig,
} from "./db-indexes";

// -------------------------------------------------------------------------
// Quests (Phase 9a)
// -------------------------------------------------------------------------
export * from "./quests";

// -------------------------------------------------------------------------
// Achievements (Phase 9b)
// -------------------------------------------------------------------------
export * from "./achievements";

// -------------------------------------------------------------------------
// Events (Phase 9e)
// -------------------------------------------------------------------------
export * from "./events";

// -------------------------------------------------------------------------
// Reports (Phase 9f)
// -------------------------------------------------------------------------
export * from "./reports";

// -------------------------------------------------------------------------
// Launch Ops (Phase 10a)
// -------------------------------------------------------------------------
export * from "../ops";

// -------------------------------------------------------------------------
// Moderation (Phase 10c)
// -------------------------------------------------------------------------
export * from "./moderation";

// -------------------------------------------------------------------------
// Initialization
// -------------------------------------------------------------------------
export {
  initEconomy,
  checkEconomyHealth,
  type EconomyInitOptions,
} from "./init";
