import { applyReputationPreset, updateReputationRule } from "@/db/repositories/autorole.presets";
import { AutoRoleRulesRepo } from "@/db/repositories/autorole.repo";
import { getGuildRules } from "@/modules/autorole/cache";
import {
  assert,
  assertEqual,
  ops,
  type Suite,
} from "./_utils";

export const suite: Suite = {
  name: "autorole presets",
  tests: [
    {
      name: "updateReputationRule default refresh",
      ops: [ops.create, ops.update, ops.cache],
      run: async ({ factory }) => {
        const guildId = factory.guildId();
        const rule = await updateReputationRule({
          guildId,
          name: "rep-5",
          minRep: 5,
          roleId: factory.roleId(),
          createdBy: "tester",
        });

        assertEqual(
          rule.trigger.type,
          "REPUTATION_THRESHOLD",
          "updateReputationRule should create reputation rule",
        );

        const cache = getGuildRules(guildId);
        assert(
          cache.repThresholds.some((entry) => entry.name === "rep-5"),
          "updateReputationRule should refresh cache",
        );

        await AutoRoleRulesRepo.delete({ guildId, name: "rep-5" });
      },
    },
    {
      name: "updateReputationRule without refresh",
      ops: [ops.create],
      run: async ({ factory }) => {
        const guildId = factory.guildId();
        const name = "rep-no-refresh";

        await updateReputationRule(
          {
            guildId,
            name,
            minRep: 3,
            roleId: factory.roleId(),
            createdBy: "tester",
          },
          { refreshCache: false },
        );

        const cache = getGuildRules(guildId);
        assert(
          cache.repThresholds.every((entry) => entry.name !== name),
          "refreshCache false should not update cache",
        );

        await AutoRoleRulesRepo.delete({ guildId, name });
      },
    },
    {
      name: "applyReputationPreset",
      ops: [ops.upsert, ops.delete, ops.cache],
      run: async ({ factory }) => {
        const guildId = factory.guildId();
        await updateReputationRule(
          {
            guildId,
            name: "legacy",
            minRep: 1,
            roleId: factory.roleId(),
            createdBy: "tester",
          },
          { refreshCache: false },
        );

        const applied = await applyReputationPreset(
          guildId,
          [
            { name: "rep-10", minRep: 10, roleId: factory.roleId() },
            { name: "rep-20", minRep: 20, roleId: factory.roleId() },
          ],
          "tester",
        );
        assertEqual(applied.length, 2, "applyReputationPreset should upsert rules");

        const rules = await AutoRoleRulesRepo.fetchByGuild(guildId);
        const repRules = rules.filter((rule) => rule.trigger.type === "REPUTATION_THRESHOLD");
        const names = repRules.map((rule) => rule.name);
        assert(!names.includes("legacy"), "applyReputationPreset should remove old rules");
        assert(names.includes("rep-10") && names.includes("rep-20"), "applyReputationPreset should keep new rules");

        const cache = getGuildRules(guildId);
        assert(
          cache.repThresholds.some((entry) => entry.name === "rep-10"),
          "applyReputationPreset should refresh cache",
        );

        await AutoRoleRulesRepo.delete({ guildId, name: "rep-10" });
        await AutoRoleRulesRepo.delete({ guildId, name: "rep-20" });
      },
    },
  ],
};
