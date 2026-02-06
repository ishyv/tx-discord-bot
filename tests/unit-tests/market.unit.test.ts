import { assertEqual, type Suite, ops } from "../db-tests/_utils";
import {
  computeMarketPricing,
  sortListingsForDisplay,
} from "../../src/modules/market/service";
import type { MarketListingDoc } from "../../src/modules/market/schema";

const buildListing = (
  id: string,
  pricePerUnit: number,
  createdAt: Date,
): MarketListingDoc => ({
  _id: id,
  guildId: "g1",
  sellerId: "u1",
  itemId: "stone",
  itemKind: "stackable",
  currencyId: "coins",
  pricePerUnit,
  quantity: 10,
  instanceIds: [],
  escrowInstances: [],
  createdAt,
  updatedAt: createdAt,
  expiresAt: null,
  status: "active",
  version: 0,
  category: "materials",
});

export const suite: Suite = {
  name: "market.unit",
  tests: [
    {
      name: "pricing includes tax and fee",
      ops: [ops.service],
      run: async () => {
        const pricing = computeMarketPricing(1000, {
          taxEnabled: true,
          taxRate: 0.1,
          minimumTaxableAmount: 0,
          feeRate: 0.02,
        });

        assertEqual(pricing.subtotal, 1000, "subtotal mismatch");
        assertEqual(pricing.tax, 100, "tax mismatch");
        assertEqual(pricing.fee, 20, "fee mismatch");
        assertEqual(pricing.total, 1120, "total mismatch");
        assertEqual(pricing.sellerPayout, 1000, "seller payout mismatch");
      },
    },
    {
      name: "pricing skips tax below threshold",
      ops: [ops.service],
      run: async () => {
        const pricing = computeMarketPricing(99, {
          taxEnabled: true,
          taxRate: 0.25,
          minimumTaxableAmount: 100,
          feeRate: 0,
        });
        assertEqual(pricing.tax, 0, "tax should be zero");
        assertEqual(pricing.total, 99, "total should equal subtotal");
      },
    },
    {
      name: "sorts listings by price then age",
      ops: [ops.list],
      run: async () => {
        const a = buildListing("a", 15, new Date("2025-01-01T00:00:05Z"));
        const b = buildListing("b", 10, new Date("2025-01-01T00:00:10Z"));
        const c = buildListing("c", 10, new Date("2025-01-01T00:00:01Z"));

        const sorted = sortListingsForDisplay([a, b, c]);
        assertEqual(sorted[0]?._id, "c", "oldest cheaper listing should come first");
        assertEqual(sorted[1]?._id, "b", "second listing mismatch");
        assertEqual(sorted[2]?._id, "a", "expensive listing should come last");
      },
    },
  ],
};
