import {
  getLevelFromXP,
  getXPForLevel,
} from "../../src/modules/economy/progression/curve";
import { assertEqual } from "../db-tests/_utils/assert";
import { ops, type Suite } from "../db-tests/_utils/runner";

export const suite: Suite = {
  name: "Progression curve",
  tests: [
    {
      name: "level boundaries map to expected levels",
      ops: [ops.read],
      async run() {
        assertEqual(getLevelFromXP(0), 1, "0 XP should be level 1");
        assertEqual(
          getLevelFromXP(getXPForLevel(2)),
          2,
          "XP at level 2 threshold should be level 2",
        );
        assertEqual(
          getLevelFromXP(getXPForLevel(3) - 1),
          2,
          "XP below level 3 threshold should be level 2",
        );
      },
    },
    {
      name: "level caps at 12",
      ops: [ops.read],
      async run() {
        assertEqual(getLevelFromXP(999999), 12, "XP should cap at level 12");
        assertEqual(
          getXPForLevel(12) > 0,
          true,
          "level 12 should have XP threshold",
        );
      },
    },
  ],
};
