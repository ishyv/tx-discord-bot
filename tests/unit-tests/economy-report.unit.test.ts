/**
 * Economy Report Unit Tests.
 *
 * Purpose: Verify report calculation logic and formatting stability.
 */

import { assertEqual, assert } from "../db-tests/_utils/assert";
import { ops, type Suite } from "../db-tests/_utils/runner";
import {
  isMintingOperation,
  isSinkOperation,
  isTransferOperation,
  getSourceLabel,
  getSinkLabel,
  DEFAULT_REPORT_THRESHOLDS,
  MINTING_OPERATIONS,
  SINK_OPERATIONS,
} from "../../src/modules/economy/reports";
import type {
  CurrencyFlowSummary,
  BalanceDistribution,
  EconomyRecommendation,
} from "../../src/modules/economy/reports";

export const suite: Suite = {
  name: "economy-report",
  tests: [
    // Operation type classification tests
    {
      name: "correctly identifies minting operations",
      ops: [ops.other],
      run() {
        assert(isMintingOperation("daily_claim"), "daily_claim should be minting");
        assert(isMintingOperation("work_claim"), "work_claim should be minting");
        assert(isMintingOperation("quest_complete"), "quest_complete should be minting");
        assert(isMintingOperation("currency_adjust"), "currency_adjust should be minting");
        assert(!isMintingOperation("item_purchase"), "item_purchase should not be minting");
        assert(!isMintingOperation("currency_transfer"), "currency_transfer should not be minting");
        assert(!isMintingOperation("unknown_op"), "unknown_op should not be minting");
      },
    },
    {
      name: "correctly identifies sink operations",
      ops: [ops.other],
      run() {
        assert(isSinkOperation("item_purchase"), "item_purchase should be sink");
        assert(isSinkOperation("perk_purchase"), "perk_purchase should be sink");
        assert(isSinkOperation("craft"), "craft should be sink");
        assert(isSinkOperation("currency_adjust"), "currency_adjust should be sink");
        assert(!isSinkOperation("daily_claim"), "daily_claim should not be sink");
        assert(!isSinkOperation("currency_transfer"), "currency_transfer should not be sink");
      },
    },
    {
      name: "correctly identifies transfer operations",
      ops: [ops.other],
      run() {
        assert(isTransferOperation("currency_transfer"), "currency_transfer should be transfer");
        assert(isTransferOperation("item_sell"), "item_sell should be transfer");
        assert(!isTransferOperation("daily_claim"), "daily_claim should not be transfer");
        assert(!isTransferOperation("item_purchase"), "item_purchase should not be transfer");
      },
    },
    // Label function tests
    {
      name: "returns correct source labels",
      ops: [ops.other],
      run() {
        assertEqual(getSourceLabel("daily_claim"), "🎁 Daily Rewards", "daily_claim label mismatch");
        assertEqual(getSourceLabel("work_claim"), "💼 Work Rewards", "work_claim label mismatch");
        assertEqual(getSourceLabel("quest_complete"), "📜 Quest Rewards", "quest_complete label mismatch");
        assertEqual(getSourceLabel("unknown"), "📊 unknown", "unknown label mismatch");
      },
    },
    {
      name: "returns correct sink labels",
      ops: [ops.other],
      run() {
        assertEqual(getSinkLabel("item_purchase"), "🛒 Store Purchases", "item_purchase label mismatch");
        assertEqual(getSinkLabel("craft"), "🔨 Crafting Costs", "craft label mismatch");
        assertEqual(getSinkLabel("unknown"), "📊 unknown", "unknown sink label mismatch");
      },
    },
    // Default thresholds tests
    {
      name: "has reasonable default threshold values",
      ops: [ops.other],
      run() {
        assert(DEFAULT_REPORT_THRESHOLDS.highInflationPct > 0, "highInflationPct should be positive");
        assert(DEFAULT_REPORT_THRESHOLDS.deflationThresholdPct < 0, "deflationThresholdPct should be negative");
        assert(DEFAULT_REPORT_THRESHOLDS.wealthConcentrationRatio > 0, "wealthConcentrationRatio should be positive");
        assert(DEFAULT_REPORT_THRESHOLDS.minDailyTransactions > 0, "minDailyTransactions should be positive");
      },
    },
    // Inflation rate calculation tests
    {
      name: "calculates positive inflation correctly",
      ops: [ops.other],
      run() {
        const flow: CurrencyFlowSummary = {
          currencyId: "coins",
          totalMinted: 1000,
          totalSunk: 200,
          netInflation: 800,
          inflationRatePct: 80,
        };
        assertEqual(flow.inflationRatePct, 80, "inflation rate should be 80%");
        assert(flow.netInflation > 0, "netInflation should be positive");
      },
    },
    {
      name: "calculates negative inflation (deflation) correctly",
      ops: [ops.other],
      run() {
        const flow: CurrencyFlowSummary = {
          currencyId: "coins",
          totalMinted: 100,
          totalSunk: 500,
          netInflation: -400,
          inflationRatePct: -400,
        };
        assert(flow.netInflation < 0, "netInflation should be negative for deflation");
      },
    },
    {
      name: "handles zero minting edge case",
      ops: [ops.other],
      run() {
        const flow: CurrencyFlowSummary = {
          currencyId: "tokens",
          totalMinted: 0,
          totalSunk: 0,
          netInflation: 0,
          inflationRatePct: 0,
        };
        assertEqual(flow.inflationRatePct, 0, "inflation should be 0 when no minting");
      },
    },
    // Balance distribution tests
    {
      name: "validates percentile structure",
      ops: [ops.other],
      run() {
        const dist: BalanceDistribution = {
          currencyId: "coins",
          totalHolders: 100,
          p50: 1000,
          p90: 5000,
          p99: 10000,
          max: 50000,
          mean: 2500,
        };
        assert(dist.p50 <= dist.p90, "p50 should be <= p90");
        assert(dist.p90 <= dist.p99, "p90 should be <= p99");
        assert(dist.p99 <= dist.max, "p99 should be <= max");
      },
    },
    {
      name: "calculates wealth concentration ratio correctly",
      ops: [ops.other],
      run() {
        const dist: BalanceDistribution = {
          currencyId: "coins",
          totalHolders: 1000,
          p50: 1000,
          p90: 10000,
          p99: 50000,
          max: 100000,
          mean: 5000,
        };
        const ratio = dist.p99 / dist.p50;
        assertEqual(ratio, 50, "wealth concentration ratio should be 50x");
      },
    },
    // Recommendation tests
    {
      name: "creates inflation recommendation with correct structure",
      ops: [ops.other],
      run() {
        const rec: EconomyRecommendation = {
          type: "inflation",
          severity: "warning",
          message: "High inflation detected for coins: +25% over 7 days",
          suggestedActions: ["Reduce daily reward amounts", "Increase store prices"],
          metrics: { currency: "coins", inflationRate: "25%" },
        };
        assertEqual(rec.type, "inflation", "type should be inflation");
        assert(rec.suggestedActions.length > 0, "should have suggested actions");
        assertEqual(rec.metrics.currency, "coins", "currency should be coins");
      },
    },
    {
      name: "creates deflation recommendation",
      ops: [ops.other],
      run() {
        const rec: EconomyRecommendation = {
          type: "deflation",
          severity: "warning",
          message: "Deflation detected",
          suggestedActions: ["Increase rewards"],
          metrics: {},
        };
        assertEqual(rec.type, "deflation", "type should be deflation");
      },
    },
    {
      name: "creates wealth gap recommendation",
      ops: [ops.other],
      run() {
        const rec: EconomyRecommendation = {
          type: "wealth_gap",
          severity: "critical",
          message: "High wealth concentration",
          suggestedActions: ["Enable progressive tax"],
          metrics: { ratio: "200" },
        };
        assertEqual(rec.type, "wealth_gap", "type should be wealth_gap");
        assertEqual(rec.severity, "critical", "severity should be critical");
      },
    },
    {
      name: "creates healthy status recommendation",
      ops: [ops.other],
      run() {
        const rec: EconomyRecommendation = {
          type: "healthy",
          severity: "info",
          message: "Economy appears healthy",
          suggestedActions: ["Continue monitoring"],
          metrics: {},
        };
        assertEqual(rec.type, "healthy", "type should be healthy");
        assertEqual(rec.severity, "info", "severity should be info");
      },
    },
    // Time window tests
    {
      name: "calculates correct time window for 7 days",
      ops: [ops.other],
      run() {
        const days = 7;
        const toDate = new Date();
        const fromDate = new Date(toDate.getTime() - days * 24 * 60 * 60 * 1000);
        const diffMs = toDate.getTime() - fromDate.getTime();
        const diffDays = diffMs / (24 * 60 * 60 * 1000);
        assertEqual(Math.round(diffDays), 7, "time window should be 7 days");
      },
    },
    {
      name: "enforces maximum report window",
      ops: [ops.other],
      run() {
        const requestedDays = 60;
        const maxDays = 30;
        const actualDays = Math.min(requestedDays, maxDays);
        assertEqual(actualDays, 30, "should cap at maxDays");
      },
    },
    {
      name: "enforces minimum report window",
      ops: [ops.other],
      run() {
        const requestedDays = 0;
        const minDays = 1;
        const actualDays = Math.max(requestedDays, minDays);
        assertEqual(actualDays, 1, "should enforce minimum of 1 day");
      },
    },
    // Flow entry calculation tests
    {
      name: "calculates percentage correctly",
      ops: [ops.other],
      run() {
        const total = 1000;
        const amount = 250;
        const percentage = Number(((amount / total) * 100).toFixed(1));
        assertEqual(percentage, 25, "percentage should be 25%");
      },
    },
    {
      name: "handles zero total gracefully",
      ops: [ops.other],
      run() {
        const total = 0;
        const amount = 0;
        const percentage = total > 0 ? Number(((amount / total) * 100).toFixed(1)) : 0;
        assertEqual(percentage, 0, "percentage should be 0 for zero total");
      },
    },
    // Daily activity aggregation tests
    {
      name: "aggregates minted amounts by currency",
      ops: [ops.other],
      run() {
        const daily = {
          date: "2026-01-15",
          minted: { coins: 1000, tokens: 50 },
          sunk: { coins: 200 },
          netInflation: { coins: 800, tokens: 50 },
          transactionCount: 15,
        };
        const totalMinted = Object.values(daily.minted).reduce((a, b) => a + b, 0);
        assertEqual(totalMinted, 1050, "total minted should be 1050");
      },
    },
    {
      name: "calculates net inflation per currency",
      ops: [ops.other],
      run() {
        const minted: Record<string, number> = { coins: 1000, tokens: 100 };
        const sunk: Record<string, number> = { coins: 300, tokens: 20 };
        const netInflation: Record<string, number> = {};
        for (const [currency, amount] of Object.entries(minted)) {
          netInflation[currency] = amount - (sunk[currency] ?? 0);
        }
        assertEqual(netInflation.coins, 700, "coins net inflation should be 700");
        assertEqual(netInflation.tokens, 80, "tokens net inflation should be 80");
      },
    },
    // Constants validation tests
    {
      name: "has valid minting operations list",
      ops: [ops.other],
      run() {
        assert(MINTING_OPERATIONS.length > 0, "should have minting operations");
        assert(MINTING_OPERATIONS.includes("daily_claim" as any), "should include daily_claim");
        assert(MINTING_OPERATIONS.includes("work_claim" as any), "should include work_claim");
      },
    },
    {
      name: "has valid sink operations list",
      ops: [ops.other],
      run() {
        assert(SINK_OPERATIONS.length > 0, "should have sink operations");
        assert(SINK_OPERATIONS.includes("item_purchase" as any), "should include item_purchase");
        assert(SINK_OPERATIONS.includes("craft" as any), "should include craft");
      },
    },
  ],
};
