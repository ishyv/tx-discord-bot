/**
 * Economy Reports Module.
 *
 * Purpose: Telemetry and balance reporting for economy systems.
 */

export { economyReportService } from "./service";
export type { QuickStats, EconomyReportService } from "./service";
export {
  DEFAULT_REPORT_THRESHOLDS,
  isMintingOperation,
  isSinkOperation,
  isTransferOperation,
  getSourceLabel,
  getSinkLabel,
  MINTING_OPERATIONS,
  SINK_OPERATIONS,
  TRANSFER_OPERATIONS,
} from "./types";
export type {
  ReportTimeWindow,
  CurrencyFlowSummary,
  FlowEntry,
  DailyActivity,
  BalanceDistribution,
  EconomyReport,
  EconomyRecommendation,
  EconomyReportWithRecommendations,
  GenerateReportInput,
  ReportThresholds,
} from "./types";
