import type { ItemInventory } from "../../src/modules/inventory/inventory";
import {
  calculateCapacity,
  simulateCapacityAfterAdd,
} from "../../src/modules/inventory/capacity";
import { assertEqual } from "../db-tests/_utils/assert";
import { ops, type Suite } from "../db-tests/_utils/runner";

export const suite: Suite = {
  name: "Inventory capacity",
  tests: [
    {
      name: "calculates weight and slots with stack rules",
      ops: [ops.read],
      async run() {
        const inventory: ItemInventory = {
          stick: { id: "stick", quantity: 3 },
          sword: { id: "sword", quantity: 2 },
        };

        const stats = calculateCapacity(inventory);

        assertEqual(
          stats.currentWeight,
          13,
          "weight should sum using item weights",
        );
        assertEqual(
          stats.currentSlots,
          3,
          "slots should use stackable vs non-stackable rules",
        );
        assertEqual(
          stats.remainingWeight,
          stats.maxWeight - stats.currentWeight,
          "remaining weight should match",
        );
        assertEqual(
          stats.remainingSlots,
          stats.maxSlots - stats.currentSlots,
          "remaining slots should match",
        );
        assertEqual(stats.weightExceeded, false, "weight should not exceed");
        assertEqual(stats.slotsExceeded, false, "slots should not exceed");
      },
    },
    {
      name: "simulates stackable additions without extra slots",
      ops: [ops.update],
      async run() {
        const inventory: ItemInventory = {
          stick: { id: "stick", quantity: 3 },
        };

        const stats = simulateCapacityAfterAdd(inventory, "stick", 2);

        assertEqual(
          stats.currentWeight,
          5,
          "weight should increase with added stack",
        );
        assertEqual(
          stats.currentSlots,
          1,
          "stackable additions should not add slots",
        );
      },
    },
    {
      name: "simulates non-stackable additions with slot growth",
      ops: [ops.update],
      async run() {
        const inventory: ItemInventory = {};

        const stats = simulateCapacityAfterAdd(inventory, "sword", 3);

        assertEqual(
          stats.currentWeight,
          15,
          "weight should scale with quantity",
        );
        assertEqual(
          stats.currentSlots,
          3,
          "non-stackable items should consume one slot per unit",
        );
      },
    },
  ],
};
