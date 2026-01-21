import {
  AutoRoleGrantsRepo,
  AutoRoleRulesRepo,
  AutoRoleTalliesRepo,
} from "../../src/db/repositories/autorole.repo";
import {
  assert,
  assertEqual,
  ops,
  withConsoleMuted,
  type Suite,
} from "./_utils";

const triggerAny = { type: "MESSAGE_REACT_ANY", args: {} } as const;

export const suite: Suite = {
  name: "autorole repo",
  tests: [
    {
      name: "rules insert/fetch/list",
      ops: [ops.create, ops.read, ops.list],
      run: async ({ factory }) => {
        const guildId = factory.guildId();
        const ruleName = factory.nextId("rule");
        const roleId = factory.roleId();

        const inserted = await AutoRoleRulesRepo.insert({
          guildId,
          name: ruleName,
          trigger: triggerAny,
          roleId,
          durationMs: null,
          enabled: true,
          createdBy: "tester",
        });
        assertEqual(inserted.name, ruleName, "insert should persist rule");

        const fetched = await AutoRoleRulesRepo.fetchOne(guildId, ruleName);
        assert(fetched !== null && fetched.name === ruleName, "fetchOne should return rule");

        const byGuild = await AutoRoleRulesRepo.fetchByGuild(guildId);
        assert(byGuild.some((rule) => rule.name === ruleName), "fetchByGuild should include rule");

        const names = await AutoRoleRulesRepo.listNames(guildId);
        assert(names.includes(ruleName), "listNames should include rule");

        const all = await AutoRoleRulesRepo.fetchAll();
        assert(all.some((rule) => rule.name === ruleName), "fetchAll should include rule");

        await AutoRoleRulesRepo.delete({ guildId, name: ruleName });
      },
    },
    {
      name: "rules invalid trigger handling",
      ops: [ops.create, ops.upsert],
      run: async ({ factory }) => {
        const guildId = factory.guildId();
        const ruleName = factory.nextId("rule");
        const roleId = factory.roleId();

        await withConsoleMuted(["error"], async () => {
          const invalidInsert = await AutoRoleRulesRepo.insert({
            guildId,
            name: ruleName,
            trigger: { type: "UNKNOWN", args: {} } as any,
            roleId,
            durationMs: null,
            enabled: true,
            createdBy: "tester",
          });
          assertEqual(
            invalidInsert.enabled,
            false,
            "invalid trigger insert should disable rule",
          );
        });

        const missing = await AutoRoleRulesRepo.fetchOne(guildId, ruleName);
        assertEqual(missing, null, "invalid insert should not persist rule");

        const ruleNameTwo = factory.nextId("rule");
        await withConsoleMuted(["error"], async () => {
          const invalidUpsert = await AutoRoleRulesRepo.upsert({
            guildId,
            name: ruleNameTwo,
            trigger: { type: "UNKNOWN", args: {} } as any,
            roleId,
            durationMs: null,
            enabled: true,
            createdBy: "tester",
          });
          assertEqual(
            invalidUpsert.enabled,
            false,
            "invalid trigger upsert should disable rule",
          );
        });

        const fetched = await AutoRoleRulesRepo.fetchOne(guildId, ruleNameTwo);
        assert(
          fetched !== null && fetched.enabled === false,
          "invalid upsert should persist disabled rule",
        );

        await AutoRoleRulesRepo.delete({ guildId, name: ruleNameTwo });
      },
    },
    {
      name: "rules updateEnabled and delete",
      ops: [ops.update, ops.delete],
      run: async ({ factory }) => {
        const guildId = factory.guildId();
        const ruleName = factory.nextId("rule");
        const roleId = factory.roleId();

        await AutoRoleRulesRepo.insert({
          guildId,
          name: ruleName,
          trigger: triggerAny,
          roleId,
          durationMs: null,
          enabled: true,
          createdBy: "tester",
        });

        const disabled = await AutoRoleRulesRepo.updateEnabled({
          guildId,
          name: ruleName,
          enabled: false,
        });
        assert(disabled !== null && disabled.enabled === false, "updateEnabled should toggle");

        await AutoRoleGrantsRepo.upsert({
          guildId,
          userId: factory.userId(),
          roleId,
          ruleName,
          type: "LIVE",
          expiresAt: null,
        });

        const deleted = await AutoRoleRulesRepo.delete({ guildId, name: ruleName });
        assertEqual(deleted, true, "delete should remove rule");

        const grants = await AutoRoleGrantsRepo.listForRule(guildId, ruleName);
        assertEqual(grants.length, 0, "delete should remove related grants");
      },
    },
    {
      name: "grants lifecycle",
      ops: [ops.create, ops.read, ops.list, ops.delete],
      run: async ({ factory }) => {
        const guildId = factory.guildId();
        const ruleName = factory.nextId("rule");
        const roleId = factory.roleId();
        const userId = factory.userId();

        await AutoRoleRulesRepo.insert({
          guildId,
          name: ruleName,
          trigger: triggerAny,
          roleId,
          durationMs: null,
          enabled: true,
          createdBy: "tester",
        });

        const liveGrant = await AutoRoleGrantsRepo.upsert({
          guildId,
          userId,
          roleId,
          ruleName,
          type: "LIVE",
          expiresAt: null,
        });
        assertEqual(liveGrant.userId, userId, "upsert should persist grant");

        const found = await AutoRoleGrantsRepo.find(
          guildId,
          userId,
          roleId,
          ruleName,
          "LIVE",
        );
        assert(found !== null && found.userId === userId, "find should return grant");

        const listMember = await AutoRoleGrantsRepo.listForMemberRole(
          guildId,
          userId,
          roleId,
        );
        assert(listMember.length >= 1, "listForMemberRole should return grants");

        const listRule = await AutoRoleGrantsRepo.listForRule(guildId, ruleName);
        assert(listRule.length >= 1, "listForRule should return grants");

        const count = await AutoRoleGrantsRepo.countForRole(guildId, userId, roleId);
        assert(count >= 1, "countForRole should count grants");

        const timedUser = factory.userId();
        await AutoRoleGrantsRepo.upsert({
          guildId,
          userId: timedUser,
          roleId,
          ruleName,
          type: "TIMED",
          expiresAt: new Date(Date.now() - 1000),
        });
        const due = await AutoRoleGrantsRepo.listDueTimed(new Date());
        assert(
          due.some((grant) => grant.userId === timedUser && grant.ruleName === ruleName),
          "listDueTimed should include expired grants",
        );

        const deletedLive = await AutoRoleGrantsRepo.deleteOne({
          guildId,
          userId,
          roleId,
          ruleName,
          type: "LIVE",
        });
        assertEqual(deletedLive, true, "deleteOne should remove grant");

        const deletedMissing = await AutoRoleGrantsRepo.deleteOne({
          guildId,
          userId,
          roleId,
          ruleName,
          type: "LIVE",
        });
        assertEqual(deletedMissing, false, "deleteOne should be idempotent");

        await AutoRoleRulesRepo.delete({ guildId, name: ruleName });
      },
    },
    {
      name: "grants purge",
      ops: [ops.delete],
      run: async ({ factory }) => {
        const guildId = factory.guildId();
        const ruleName = factory.nextId("rule");
        const roleId = factory.roleId();

        await AutoRoleRulesRepo.insert({
          guildId,
          name: ruleName,
          trigger: triggerAny,
          roleId,
          durationMs: null,
          enabled: true,
          createdBy: "tester",
        });

        const userOne = factory.userId();
        const userTwo = factory.userId();
        await AutoRoleGrantsRepo.upsert({
          guildId,
          userId: userOne,
          roleId,
          ruleName,
          type: "LIVE",
          expiresAt: null,
        });
        await AutoRoleGrantsRepo.upsert({
          guildId,
          userId: userTwo,
          roleId,
          ruleName,
          type: "LIVE",
          expiresAt: null,
        });

        const purged = await AutoRoleGrantsRepo.purgeForRule(guildId, ruleName);
        assert(purged >= 2, "purgeForRule should remove grants");

        const ruleNameTwo = factory.nextId("rule");
        const roleIdTwo = factory.roleId();
        await AutoRoleRulesRepo.insert({
          guildId,
          name: ruleNameTwo,
          trigger: triggerAny,
          roleId: roleIdTwo,
          durationMs: null,
          enabled: true,
          createdBy: "tester",
        });
        await AutoRoleGrantsRepo.upsert({
          guildId,
          userId: factory.userId(),
          roleId: roleIdTwo,
          ruleName: ruleNameTwo,
          type: "LIVE",
          expiresAt: null,
        });

        const purgedRole = await AutoRoleGrantsRepo.purgeForGuildRole(guildId, roleIdTwo);
        assert(purgedRole >= 1, "purgeForGuildRole should remove grants");

        await AutoRoleRulesRepo.delete({ guildId, name: ruleName });
        await AutoRoleRulesRepo.delete({ guildId, name: ruleNameTwo });
      },
    },
    {
      name: "tallies lifecycle",
      ops: [ops.create, ops.read, ops.update, ops.delete],
      run: async ({ factory }) => {
        const guildId = factory.guildId();
        const messageId = factory.messageId();
        const tallyKey = { guildId, messageId, emojiKey: "smile" };

        const first = await AutoRoleTalliesRepo.increment(tallyKey, factory.userId());
        assertEqual(first.count, 1, "increment should start at 1");

        const second = await AutoRoleTalliesRepo.increment(tallyKey, factory.userId());
        assertEqual(second.count, 2, "increment should bump count");

        const read = await AutoRoleTalliesRepo.read(tallyKey);
        assert(read !== null && read.count === 2, "read should return tally");

        const list = await AutoRoleTalliesRepo.listForMessage(guildId, messageId);
        assert(list.length >= 1, "listForMessage should include tally");

        const afterDec = await AutoRoleTalliesRepo.decrement(tallyKey);
        assert(afterDec !== null && afterDec.count === 1, "decrement should reduce count");

        const afterDecTwo = await AutoRoleTalliesRepo.decrement(tallyKey);
        assert(afterDecTwo !== null && afterDecTwo.count === 0, "decrement should reach zero");

        const afterDelete = await AutoRoleTalliesRepo.read(tallyKey);
        assertEqual(afterDelete, null, "decrement to zero should delete tally");

        const deletedMissing = await AutoRoleTalliesRepo.deleteOne({
          guildId,
          messageId,
          emojiKey: "missing",
        });
        assertEqual(deletedMissing, false, "deleteOne should return false when missing");

        await AutoRoleTalliesRepo.increment({ guildId, messageId, emojiKey: "heart" }, factory.userId());
        const removedForMessage = await AutoRoleTalliesRepo.deleteForMessage(guildId, messageId);
        assert(removedForMessage >= 1, "deleteForMessage should remove tallies");
      },
    },
  ],
};
