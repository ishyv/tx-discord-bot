/**
 * Store Rotation Unit Tests (Phase 9d).
 *
 * Purpose: Test rotation stability, pricing calculations, and audit metadata.
 */

import { assertEqual, assert } from "../db-tests/_utils/assert";
import { ops, type Suite } from "../db-tests/_utils/runner";
import {
  calculateFeaturedPrice,
  isRotationDue,
  buildDefaultRotation,
  DEFAULT_ROTATION_CONFIG,
} from "../../src/modules/economy/store/rotation/types";

export const suite: Suite = {
  name: "store-rotation",
  tests: [
    {
      name: "calculateFeaturedPrice applies discount correctly",
      ops: [ops.other],
      run() {
        const result = calculateFeaturedPrice(
          100, // base price
          0.15, // 15% discount
          0.25, // 25% scarcity markup
          100, // stock (above threshold)
          10, // scarcity threshold
        );
        // 100 * (1 - 0.15) = 85
        assertEqual(result.price, 85, "Price should apply 15% discount");
        assertEqual(result.appliedScarcity, 0, "No scarcity markup when stock is high");
      },
    },
    {
      name: "calculateFeaturedPrice applies scarcity markup when stock low",
      ops: [ops.other],
      run() {
        const result = calculateFeaturedPrice(
          100, // base price
          0.15, // 15% discount
          0.25, // 25% scarcity markup
          5, // stock (below threshold of 10)
          10, // scarcity threshold
        );
        // 100 * (1 - 0.15) * (1 + 0.25) = 85 * 1.25 = 106.25 -> 106
        assertEqual(result.price, 106, "Price should include scarcity markup");
        assertEqual(result.appliedScarcity, 0.25, "Scarcity should be 25%");
      },
    },
    {
      name: "calculateFeaturedPrice returns minimum price of 1",
      ops: [ops.other],
      run() {
        const result = calculateFeaturedPrice(
          1, // base price
          0.99, // 99% discount
          0, // no markup
          100,
          10,
        );
        assertEqual(result.price, 1, "Minimum price should be 1");
      },
    },
    {
      name: "calculateFeaturedPrice handles unlimited stock (-1)",
      ops: [ops.other],
      run() {
        const result = calculateFeaturedPrice(
          100,
          0.15,
          0.25,
          -1, // unlimited stock
          10,
        );
        // Unlimited stock should not trigger scarcity markup
        assertEqual(result.price, 85, "Unlimited stock should not trigger scarcity");
        assertEqual(result.appliedScarcity, 0, "No scarcity for unlimited stock");
      },
    },
    {
      name: "isRotationDue returns false for disabled mode",
      ops: [ops.other],
      run() {
        const futureDate = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now
        assert(!isRotationDue(futureDate, "disabled"), "Disabled mode should not be due");
        assert(!isRotationDue(new Date(Date.now() - 1000), "disabled"), "Disabled mode should not be due even with past date");
      },
    },
    {
      name: "isRotationDue returns true when past rotation time",
      ops: [ops.other],
      run() {
        const pastDate = new Date(Date.now() - 1000 * 60); // 1 minute ago
        assert(isRotationDue(pastDate, "auto"), "Should be due when past time (auto)");
        assert(isRotationDue(pastDate, "manual"), "Should be due when past time (manual)");
      },
    },
    {
      name: "isRotationDue returns false when before rotation time",
      ops: [ops.other],
      run() {
        const futureDate = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now
        assert(!isRotationDue(futureDate, "auto"), "Should not be due when future (auto)");
        assert(!isRotationDue(futureDate, "manual"), "Should not be due when future (manual)");
      },
    },
    {
      name: "buildDefaultRotation creates valid rotation",
      ops: [ops.other],
      run() {
        const rotation = buildDefaultRotation("guild_123");
        assertEqual(rotation.guildId, "guild_123", "Guild ID should match");
        assertEqual(rotation.featured.length, 0, "Should have no featured items initially");
        assertEqual(rotation.config.mode, DEFAULT_ROTATION_CONFIG.mode, "Mode should match default");
        assertEqual(rotation.config.dailyFeaturedCount, DEFAULT_ROTATION_CONFIG.dailyFeaturedCount, "Count should match default");
        assertEqual(rotation.config.hasLegendarySlot, DEFAULT_ROTATION_CONFIG.hasLegendarySlot, "Legendary slot should match default");
        assertEqual(rotation.config.featuredDiscountPct, DEFAULT_ROTATION_CONFIG.featuredDiscountPct, "Discount should match default");
        assertEqual(rotation.version, 0, "Version should start at 0");
      },
    },
    {
      name: "featured price calculation is deterministic",
      ops: [ops.other],
      run() {
        // Same inputs should always produce same outputs
        const result1 = calculateFeaturedPrice(100, 0.15, 0.25, 5, 10);
        const result2 = calculateFeaturedPrice(100, 0.15, 0.25, 5, 10);
        assertEqual(result1.price, result2.price, "Prices should be deterministic");
        assertEqual(result1.appliedScarcity, result2.appliedScarcity, "Scarcity should be deterministic");
      },
    },
    {
      name: "scarcity markup rounds correctly",
      ops: [ops.other],
      run() {
        // Test various prices that might cause rounding
        const testCases = [
          { base: 99, discount: 0.15, markup: 0.25, stock: 5, expected: 105 }, // 99 * 0.85 * 1.25 = 105.1875 -> 105
          { base: 50, discount: 0.10, markup: 0.20, stock: 3, expected: 54 }, // 50 * 0.9 * 1.2 = 54
          { base: 1000, discount: 0.50, markup: 0.50, stock: 1, expected: 750 }, // 1000 * 0.5 * 1.5 = 750
        ];

        for (const tc of testCases) {
          const result = calculateFeaturedPrice(
            tc.base,
            tc.discount,
            tc.markup,
            tc.stock,
            10,
          );
          assertEqual(result.price, tc.expected, `Price for base=${tc.base} should be ${tc.expected}`);
        }
      },
    },
  ],
};
