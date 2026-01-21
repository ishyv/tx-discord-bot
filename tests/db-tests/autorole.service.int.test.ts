import { AutoRoleGrantsRepo, AutoRoleRulesRepo } from "../../src/db/repositories/autorole.repo";
import { grantByRule, purgeRule, revokeByRule } from "../../src/db/repositories/autorole.service";
import {
  assert,
  assertEqual,
  ops,
  type Suite,
} from "./_utils";

type CallLog = {
  addRole: Array<{ guildId: string; userId: string; roleId: string }>;
  removeRole: Array<{ guildId: string; userId: string; roleId: string }>;
  dms: Array<{ userId: string; content: string }>;
};

const buildClient = () => {
  const calls: CallLog = {
    addRole: [],
    removeRole: [],
    dms: [],
  };

  const client = {
    members: {
      addRole: async (guildId: string, userId: string, roleId: string) => {
        calls.addRole.push({ guildId, userId, roleId });
      },
      removeRole: async (guildId: string, userId: string, roleId: string) => {
        calls.removeRole.push({ guildId, userId, roleId });
      },
    },
    roles: {
      fetch: async (_guildId: string, roleId: string) => ({
        id: roleId,
        name: `Role-${roleId}`,
      }),
    },
    guilds: {
      fetch: async (guildId: string) => ({ id: guildId, name: `Guild-${guildId}` }),
    },
    users: {
      write: async (userId: string, payload: { content?: string }) => {
        calls.dms.push({ userId, content: payload.content ?? "" });
      },
    },
    logger: {
      debug: () => undefined,
      error: () => undefined,
    },
  };

  return { client: client as any, calls };
};

export const suite: Suite = {
  name: "autorole service",
  tests: [
    {
      name: "grantByRule live",
      ops: [ops.create, ops.service],
      run: async ({ factory }) => {
        const { client, calls } = buildClient();
        const guildId = factory.snowflake();
        const roleId = factory.snowflake();
        const userId = factory.snowflake();
        const ruleName = factory.nextId("rule");

        const liveRule = await AutoRoleRulesRepo.insert({
          guildId,
          name: ruleName,
          trigger: { type: "MESSAGE_REACT_ANY", args: {} },
          roleId,
          durationMs: null,
          enabled: true,
          createdBy: "tester",
        });

        const first = await grantByRule({
          client,
          rule: liveRule,
          userId,
          reason: "test-grant",
        });
        assertEqual(first.type, "LIVE", "grantByRule should store live grant");
        assertEqual(calls.addRole.length, 1, "grantByRule should grant role once");
        assertEqual(calls.dms.length, 1, "grantByRule should send DM");

        await grantByRule({
          client,
          rule: liveRule,
          userId,
          reason: "test-grant",
        });
        assertEqual(calls.addRole.length, 1, "grantByRule should not double grant");

        await AutoRoleRulesRepo.delete({ guildId, name: ruleName });
      },
    },
    {
      name: "grantByRule respects existing reasons",
      ops: [ops.create, ops.service],
      run: async ({ factory }) => {
        const { client, calls } = buildClient();
        const guildId = factory.snowflake();
        const roleId = factory.snowflake();
        const userId = factory.snowflake();

        const ruleA = await AutoRoleRulesRepo.insert({
          guildId,
          name: factory.nextId("rule"),
          trigger: { type: "MESSAGE_REACT_ANY", args: {} },
          roleId,
          durationMs: null,
          enabled: true,
          createdBy: "tester",
        });

        const ruleB = await AutoRoleRulesRepo.insert({
          guildId,
          name: factory.nextId("rule"),
          trigger: { type: "MESSAGE_REACT_ANY", args: {} },
          roleId,
          durationMs: null,
          enabled: true,
          createdBy: "tester",
        });

        await grantByRule({ client, rule: ruleA, userId, reason: "first" });
        await grantByRule({ client, rule: ruleB, userId, reason: "second" });

        assertEqual(calls.addRole.length, 1, "second reason should not re-grant role");

        await AutoRoleRulesRepo.delete({ guildId, name: ruleA.name });
        await AutoRoleRulesRepo.delete({ guildId, name: ruleB.name });
      },
    },
    {
      name: "grantByRule timed extends expiry",
      ops: [ops.create, ops.service],
      run: async ({ factory }) => {
        const { client, calls } = buildClient();
        const guildId = factory.snowflake();
        const roleId = factory.snowflake();
        const userId = factory.snowflake();

        const timedRule = await AutoRoleRulesRepo.insert({
          guildId,
          name: factory.nextId("rule"),
          trigger: { type: "MESSAGE_REACT_ANY", args: {} },
          roleId,
          durationMs: 2000,
          enabled: true,
          createdBy: "tester",
        });

        const first = await grantByRule({
          client,
          rule: timedRule,
          userId,
          reason: "timed-grant",
        });
        const firstExpires = first.expiresAt?.getTime() ?? 0;

        const second = await grantByRule({
          client,
          rule: timedRule,
          userId,
          reason: "timed-grant",
        });
        const secondExpires = second.expiresAt?.getTime() ?? 0;
        assert(secondExpires >= firstExpires, "grantByRule should extend expiry");
        assertEqual(calls.addRole.length, 1, "timed grant should only grant once");

        await AutoRoleRulesRepo.delete({ guildId, name: timedRule.name });
      },
    },
    {
      name: "revokeByRule respects remaining reasons",
      ops: [ops.delete, ops.service],
      run: async ({ factory }) => {
        const { client, calls } = buildClient();
        const guildId = factory.snowflake();
        const roleId = factory.snowflake();
        const userId = factory.snowflake();

        const ruleA = await AutoRoleRulesRepo.insert({
          guildId,
          name: factory.nextId("rule"),
          trigger: { type: "MESSAGE_REACT_ANY", args: {} },
          roleId,
          durationMs: null,
          enabled: true,
          createdBy: "tester",
        });
        const ruleB = await AutoRoleRulesRepo.insert({
          guildId,
          name: factory.nextId("rule"),
          trigger: { type: "MESSAGE_REACT_ANY", args: {} },
          roleId,
          durationMs: null,
          enabled: true,
          createdBy: "tester",
        });

        await grantByRule({ client, rule: ruleA, userId, reason: "grant-a" });
        await grantByRule({ client, rule: ruleB, userId, reason: "grant-b" });

        const revokedA = await revokeByRule({
          client,
          rule: ruleA,
          userId,
          reason: "revoke-a",
          grantType: "LIVE",
        });
        assertEqual(revokedA, true, "revokeByRule should remove grant");
        assertEqual(calls.removeRole.length, 0, "should not revoke while reasons remain");

        const revokedB = await revokeByRule({
          client,
          rule: ruleB,
          userId,
          reason: "revoke-b",
          grantType: "LIVE",
        });
        assertEqual(revokedB, true, "revokeByRule should remove grant");
        assertEqual(calls.removeRole.length, 1, "should revoke when last reason removed");

        await AutoRoleRulesRepo.delete({ guildId, name: ruleA.name });
        await AutoRoleRulesRepo.delete({ guildId, name: ruleB.name });
      },
    },
    {
      name: "purgeRule revocations",
      ops: [ops.delete, ops.service],
      run: async ({ factory }) => {
        const { client, calls } = buildClient();
        const guildId = factory.snowflake();
        const roleId = factory.snowflake();

        const ruleA = await AutoRoleRulesRepo.insert({
          guildId,
          name: factory.nextId("rule"),
          trigger: { type: "MESSAGE_REACT_ANY", args: {} },
          roleId,
          durationMs: null,
          enabled: true,
          createdBy: "tester",
        });
        const ruleB = await AutoRoleRulesRepo.insert({
          guildId,
          name: factory.nextId("rule"),
          trigger: { type: "MESSAGE_REACT_ANY", args: {} },
          roleId,
          durationMs: null,
          enabled: true,
          createdBy: "tester",
        });

        const userA = factory.snowflake();
        const userB = factory.snowflake();

        await AutoRoleGrantsRepo.upsert({
          guildId,
          userId: userA,
          roleId,
          ruleName: ruleA.name,
          type: "LIVE",
          expiresAt: null,
        });
        await AutoRoleGrantsRepo.upsert({
          guildId,
          userId: userB,
          roleId,
          ruleName: ruleA.name,
          type: "LIVE",
          expiresAt: null,
        });
        await AutoRoleGrantsRepo.upsert({
          guildId,
          userId: userA,
          roleId,
          ruleName: ruleB.name,
          type: "LIVE",
          expiresAt: null,
        });

        const result = await purgeRule(client, guildId, ruleA.name);
        assert(result.removedGrants >= 2, "purgeRule should remove grants");
        assertEqual(
          result.roleRevocations,
          1,
          "purgeRule should revoke only when last reason removed",
        );
        assertEqual(calls.removeRole.length, 1, "purgeRule should enqueue revoke");

        await AutoRoleRulesRepo.delete({ guildId, name: ruleA.name });
        await AutoRoleRulesRepo.delete({ guildId, name: ruleB.name });
      },
    },
  ],
};
