import { calculatePriceWithTax } from "../../src/modules/economy/store/types";
import { calculateTax } from "../../src/modules/economy/guild/service";
import { assertEqual } from "../db-tests/_utils/assert";
import { ops, type Suite } from "../db-tests/_utils/runner";

export const suite: Suite = {
  name: "Tax math",
  tests: [
    {
      name: "floors store tax calculation",
      ops: [ops.other],
      async run() {
        const result = calculatePriceWithTax(99, 3, 0.05);
        assertEqual(result.subtotal, 297, "subtotal should be base * quantity");
        assertEqual(result.tax, 14, "tax should floor the decimal portion");
        assertEqual(result.total, 311, "total should include floored tax");
      },
    },
    {
      name: "floors guild tax calculation",
      ops: [ops.other],
      async run() {
        const result = calculateTax(297, {
          enabled: true,
          minimumTaxableAmount: 0,
          rate: 0.05,
          taxSector: "tax",
        });
        assertEqual(
          result.tax,
          14,
          "guild tax should floor the decimal portion",
        );
        assertEqual(result.net, 283, "net should subtract floored tax");
        assertEqual(result.taxed, true, "tax should apply when enabled");
      },
    },
  ],
};
