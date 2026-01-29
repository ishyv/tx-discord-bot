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
export { dailyClaimRepo } from "./daily";

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
  GuildEconomyConfig,
  GuildEconomyError,
  GuildEconomyErrorCode,
} from "./guild";

export {
  DEFAULT_TAX_CONFIG,
  DEFAULT_TRANSFER_THRESHOLDS,
  DEFAULT_SECTOR_BALANCES,
  DEFAULT_DAILY_CONFIG,
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

export {
  DEFAULT_STORE_CONFIG,
} from "./store";

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
export {
  currencyTransaction,
} from "./transactions";
