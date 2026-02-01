/**
 * Economy Moderation Unit Tests (Phase 10c).
 *
 * Purpose: Verify freeze/unfreeze logic and validation.
 */

import { assertEqual, assert } from "../db-tests/_utils/assert";
import { ops, type Suite } from "../db-tests/_utils/runner";
import {
  isAccountFrozen,
  getRemainingFreezeHours,
  formatFreezeDuration,
  MAX_FREEZE_HOURS,
  DEFAULT_AUDIT_LIMIT,
  MAX_AUDIT_LIMIT,
} from "../../src/modules/economy/moderation";
import type { EconomyFreeze } from "../../src/modules/economy/moderation";

export const suite: Suite = {
  name: "economy-moderation",
  tests: [
    // Freeze status tests
    {
      name: "isAccountFrozen returns false for null freeze",
      ops: [ops.other],
      run() {
        assert(!isAccountFrozen(null), "null freeze should not be frozen");
      },
    },
    {
      name: "isAccountFrozen returns true for indefinite freeze",
      ops: [ops.other],
      run() {
        const freeze: EconomyFreeze = {
          userId: "user123",
          status: "blocked",
          reason: "Test",
          frozenAt: new Date(),
          expiresAt: null,
          frozenBy: "mod123",
          correlationId: "test123",
        };
        assert(isAccountFrozen(freeze), "indefinite freeze should be frozen");
      },
    },
    {
      name: "isAccountFrozen returns true for future expiration",
      ops: [ops.other],
      run() {
        const future = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
        const freeze: EconomyFreeze = {
          userId: "user123",
          status: "blocked",
          reason: "Test",
          frozenAt: new Date(),
          expiresAt: future,
          frozenBy: "mod123",
          correlationId: "test123",
        };
        assert(isAccountFrozen(freeze), "future expiration should be frozen");
      },
    },
    {
      name: "isAccountFrozen returns false for expired freeze",
      ops: [ops.other],
      run() {
        const past = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
        const freeze: EconomyFreeze = {
          userId: "user123",
          status: "blocked",
          reason: "Test",
          frozenAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
          expiresAt: past,
          frozenBy: "mod123",
          correlationId: "test123",
        };
        assert(!isAccountFrozen(freeze), "expired freeze should not be frozen");
      },
    },
    // Remaining hours tests
    {
      name: "getRemainingFreezeHours returns null for null freeze",
      ops: [ops.other],
      run() {
        assertEqual(getRemainingFreezeHours(null), null, "null freeze should have null hours");
      },
    },
    {
      name: "getRemainingFreezeHours returns null for indefinite freeze",
      ops: [ops.other],
      run() {
        const freeze: EconomyFreeze = {
          userId: "user123",
          status: "blocked",
          reason: "Test",
          frozenAt: new Date(),
          expiresAt: null,
          frozenBy: "mod123",
          correlationId: "test123",
        };
        assertEqual(getRemainingFreezeHours(freeze), null, "indefinite freeze should have null hours");
      },
    },
    {
      name: "getRemainingFreezeHours calculates remaining hours correctly",
      ops: [ops.other],
      run() {
        const expiresAt = new Date(Date.now() + 5 * 60 * 60 * 1000 + 30 * 60 * 1000); // 5.5 hours
        const freeze: EconomyFreeze = {
          userId: "user123",
          status: "blocked",
          reason: "Test",
          frozenAt: new Date(),
          expiresAt,
          frozenBy: "mod123",
          correlationId: "test123",
        };
        const hours = getRemainingFreezeHours(freeze);
        assert(hours !== null && hours >= 5 && hours <= 6, "should be approximately 5-6 hours remaining");
      },
    },
    {
      name: "getRemainingFreezeHours returns null for expired freeze",
      ops: [ops.other],
      run() {
        const past = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
        const freeze: EconomyFreeze = {
          userId: "user123",
          status: "blocked",
          reason: "Test",
          frozenAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          expiresAt: past,
          frozenBy: "mod123",
          correlationId: "test123",
        };
        // Expired freeze is not considered frozen, so returns null
        assertEqual(getRemainingFreezeHours(freeze), null, "expired freeze should return null (not frozen)");
      },
    },
    // Format duration tests
    {
      name: "formatFreezeDuration formats null as indefinite",
      ops: [ops.other],
      run() {
        assertEqual(formatFreezeDuration(null), "indefinite", "null should be indefinite");
      },
    },
    {
      name: "formatFreezeDuration formats hours correctly",
      ops: [ops.other],
      run() {
        assertEqual(formatFreezeDuration(0.5), "< 1 hour", "less than 1 hour");
        assertEqual(formatFreezeDuration(1), "1 hour", "1 hour");
        assertEqual(formatFreezeDuration(5), "5 hours", "multiple hours");
      },
    },
    {
      name: "formatFreezeDuration formats days correctly",
      ops: [ops.other],
      run() {
        assertEqual(formatFreezeDuration(24), "1 day", "1 day");
        assertEqual(formatFreezeDuration(48), "2 days", "2 days");
        assertEqual(formatFreezeDuration(26), "1d 2h", "1 day 2 hours");
      },
    },
    // Constants tests
    {
      name: "MAX_FREEZE_HOURS is 720 (30 days)",
      ops: [ops.other],
      run() {
        assertEqual(MAX_FREEZE_HOURS, 720, "max freeze should be 30 days (720 hours)");
      },
    },
    {
      name: "DEFAULT_AUDIT_LIMIT is reasonable",
      ops: [ops.other],
      run() {
        assert(DEFAULT_AUDIT_LIMIT > 0, "default audit limit should be positive");
        assert(DEFAULT_AUDIT_LIMIT <= 25, "default audit limit should be reasonable");
        assertEqual(DEFAULT_AUDIT_LIMIT, 10, "default should be 10");
      },
    },
    {
      name: "MAX_AUDIT_LIMIT is reasonable",
      ops: [ops.other],
      run() {
        assert(MAX_AUDIT_LIMIT > DEFAULT_AUDIT_LIMIT, "max should be greater than default");
        assert(MAX_AUDIT_LIMIT <= 1000, "max should not be excessive");
        assertEqual(MAX_AUDIT_LIMIT, 100, "max should be 100");
      },
    },
    // Freeze structure tests
    {
      name: "EconomyFreeze structure is correct",
      ops: [ops.other],
      run() {
        const freeze: EconomyFreeze = {
          userId: "user123",
          status: "blocked",
          reason: "Violation of rules",
          frozenAt: new Date("2026-01-15T10:00:00Z"),
          expiresAt: new Date("2026-01-16T10:00:00Z"),
          frozenBy: "mod456",
          correlationId: "corr_abc123",
        };

        assertEqual(freeze.userId, "user123", "userId should match");
        assertEqual(freeze.status, "blocked", "status should be blocked");
        assertEqual(freeze.reason, "Violation of rules", "reason should match");
        assertEqual(freeze.frozenBy, "mod456", "frozenBy should match");
        assertEqual(freeze.correlationId, "corr_abc123", "correlationId should match");
        assert(freeze.expiresAt !== null, "should have expiration");
      },
    },
    {
      name: "EconomyFreeze supports indefinite freeze",
      ops: [ops.other],
      run() {
        const freeze: EconomyFreeze = {
          userId: "user123",
          status: "banned",
          reason: "Permanent ban",
          frozenAt: new Date(),
          expiresAt: null,
          frozenBy: "mod456",
          correlationId: "corr_def456",
        };

        assertEqual(freeze.status, "banned", "status should be banned for indefinite");
        assertEqual(freeze.expiresAt, null, "expiresAt should be null for indefinite");
      },
    },
  ],
};
