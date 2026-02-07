import { assert, assertEqual, ops, type Suite } from "../db-tests/_utils";
import { getStepProgressIncrement } from "../../src/modules/rpg/quests/events";
import { QuestDefSchema } from "../../src/modules/rpg/quests/schema";
import type { QuestEvent, QuestStep } from "../../src/modules/rpg/quests/types";

function baseEvent(
  event: Omit<QuestEvent, "timestamp" | "guildId" | "userId"> & { type: QuestEvent["type"] },
): QuestEvent {
  return {
    ...event,
    guildId: "g1",
    userId: "u1",
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
  } as QuestEvent;
}

export const suite: Suite = {
  name: "quest-engine.unit",
  tests: [
    {
      name: "schema failures expose deep json paths",
      ops: [ops.read],
      run: async () => {
        const result = QuestDefSchema.safeParse({
          id: "Bad-Id",
          title: "",
          description: "",
          repeat: { kind: "none" },
          difficulty: "easy",
          steps: [
            {
              kind: "gather_item",
              action: "mine",
              itemId: "pyrite_ore",
              qty: 0,
            },
          ],
          rewards: {},
        });

        assert(!result.success, "Schema should reject invalid quest payload");

        const issuePaths = result.error.issues.map((issue) => issue.path.join("."));
        assert(
          issuePaths.includes("id"),
          "Expected validation issue path for id",
        );
        assert(
          issuePaths.includes("steps.0.qty"),
          "Expected validation issue path for steps.0.qty",
        );
      },
    },
    {
      name: "gather step only increments when filters match",
      ops: [ops.read],
      run: async () => {
        const step: QuestStep = {
          kind: "gather_item",
          action: "mine",
          itemId: "pyrite_ore",
          qty: 25,
          locationTierMin: 2,
          toolTierMin: 2,
        };

        const ok = getStepProgressIncrement(
          step,
          baseEvent({
            type: "gather",
            action: "mine",
            itemId: "pyrite_ore",
            qty: 5,
            locationTier: 2,
            toolTier: 2,
          }),
        );
        const wrongAction = getStepProgressIncrement(
          step,
          baseEvent({
            type: "gather",
            action: "forest",
            itemId: "pyrite_ore",
            qty: 5,
          }),
        );

        assertEqual(ok, 5, "Gather progress should increment by event qty");
        assertEqual(wrongAction, 0, "Gather progress should not increment for wrong action");
      },
    },
    {
      name: "process step respects success and output filters",
      ops: [ops.read],
      run: async () => {
        const step: QuestStep = {
          kind: "process_item",
          inputItemId: "pyrite_ore",
          outputItemId: "pyrite_ingot",
          qty: 10,
          successOnly: true,
        };

        const success = getStepProgressIncrement(
          step,
          baseEvent({
            type: "process",
            inputItemId: "pyrite_ore",
            outputItemId: "pyrite_ingot",
            qty: 3,
            success: true,
          }),
        );
        const failed = getStepProgressIncrement(
          step,
          baseEvent({
            type: "process",
            inputItemId: "pyrite_ore",
            outputItemId: "pyrite_ingot",
            qty: 3,
            success: false,
          }),
        );

        assertEqual(success, 3, "Successful processing should increment");
        assertEqual(failed, 0, "Failed processing should not increment when successOnly=true");
      },
    },
    {
      name: "craft step increments by crafted quantity",
      ops: [ops.read],
      run: async () => {
        const step: QuestStep = {
          kind: "craft_recipe",
          recipeId: "craft_miner_pickaxe_t2",
          qty: 1,
        };

        const increment = getStepProgressIncrement(
          step,
          baseEvent({
            type: "craft",
            recipeId: "craft_miner_pickaxe_t2",
            qty: 2,
          }),
        );

        assertEqual(increment, 2, "Craft progress should use crafted quantity");
      },
    },
    {
      name: "market list and buy steps map to matching events",
      ops: [ops.read],
      run: async () => {
        const listStep: QuestStep = {
          kind: "market_list_item",
          itemId: "pyrite_ingot",
          qty: 5,
        };
        const buyStep: QuestStep = {
          kind: "market_buy_item",
          itemId: "pyrite_ingot",
          qty: 5,
        };

        const listed = getStepProgressIncrement(
          listStep,
          baseEvent({
            type: "market_list",
            itemId: "pyrite_ingot",
            qty: 4,
          }),
        );
        const bought = getStepProgressIncrement(
          buyStep,
          baseEvent({
            type: "market_buy",
            itemId: "pyrite_ingot",
            qty: 2,
          }),
        );

        assertEqual(listed, 4, "Listing progress should match listed qty");
        assertEqual(bought, 2, "Buying progress should match bought qty");
      },
    },
    {
      name: "fight win step increments by one per win event",
      ops: [ops.read],
      run: async () => {
        const step: QuestStep = {
          kind: "fight_win",
          qty: 3,
        };

        const increment = getStepProgressIncrement(
          step,
          baseEvent({
            type: "fight_win",
            opponentId: "enemy_1",
          }),
        );

        assertEqual(increment, 1, "Fight wins should increment by 1 per event");
      },
    },
  ],
};
