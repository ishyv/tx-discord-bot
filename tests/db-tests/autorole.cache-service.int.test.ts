import {
  clearTrackedPresence,
  createRule,
  decrementReactionTally,
  deleteRule,
  disableRule,
  drainMessageState,
  enableRule,
  incrementReactionTally,
  loadRulesIntoCache,
  readReactionTally,
  refreshGuildRules,
  removeReactionTally,
  trackPresence,
} from "../../src/db/repositories/autorole.cache-service";
import { getGuildRules, getTally } from "../../src/modules/autorole/cache";
import { AutoRoleRulesRepo } from "../../src/db/repositories/autorole.repo";
import { assert, assertEqual, ops, type Suite } from "./_utils";

export const suite: Suite = {
  name: "autorole cache-service",
  tests: [
    {
      name: "rule cache operations",
      ops: [ops.create, ops.update, ops.delete, ops.cache],
      run: async ({ factory }) => {
        const guildId = factory.guildId();
        const ruleName = factory.nextId("rule");
        const roleId = factory.roleId();

        await createRule({
          guildId,
          name: ruleName,
          trigger: { type: "MESSAGE_REACT_ANY", args: {} },
          roleId,
          durationMs: null,
          enabled: true,
          createdBy: "tester",
        });

        const disabledName = factory.nextId("rule");
        await createRule({
          guildId,
          name: disabledName,
          trigger: { type: "MESSAGE_REACT_ANY", args: {} },
          roleId,
          durationMs: null,
          enabled: false,
          createdBy: "tester",
        });

        const cacheAfterCreate = getGuildRules(guildId);
        assert(
          cacheAfterCreate.anyReact.some((rule) => rule.name === ruleName),
          "createRule should populate cache",
        );
        assert(
          !cacheAfterCreate.anyReact.some((rule) => rule.name === disabledName),
          "disabled rules should not be cached",
        );

        const refreshed = await refreshGuildRules(guildId);
        assert(
          refreshed.some((rule) => rule.name === ruleName),
          "refreshGuildRules should return rule",
        );

        await disableRule(guildId, ruleName);
        const cacheAfterDisable = getGuildRules(guildId);
        assert(
          !cacheAfterDisable.anyReact.some((rule) => rule.name === ruleName),
          "disableRule should remove from cache",
        );

        await enableRule(guildId, ruleName);
        const cacheAfterEnable = getGuildRules(guildId);
        assert(
          cacheAfterEnable.anyReact.some((rule) => rule.name === ruleName),
          "enableRule should add to cache",
        );

        await loadRulesIntoCache();
        const cacheAfterLoad = getGuildRules(guildId);
        assert(
          cacheAfterLoad.anyReact.some((rule) => rule.name === ruleName),
          "loadRulesIntoCache should hydrate cache",
        );

        const deleted = await deleteRule(guildId, ruleName);
        assertEqual(deleted, true, "deleteRule should remove rule");

        const cacheAfterDelete = getGuildRules(guildId);
        assert(
          !cacheAfterDelete.anyReact.some((rule) => rule.name === ruleName),
          "deleteRule should clear cache",
        );

        await AutoRoleRulesRepo.delete({ guildId, name: disabledName });
      },
    },
    {
      name: "tally cache operations",
      ops: [ops.create, ops.update, ops.read, ops.cache],
      run: async ({ factory }) => {
        const key = {
          guildId: factory.guildId(),
          messageId: factory.messageId(),
          emojiKey: "smile",
        };
        const userId = factory.userId();

        const snapshot = await incrementReactionTally(key, userId);
        assertEqual(snapshot.count, 1, "incrementReactionTally should count");

        const cached = getTally(key);
        assert(
          cached !== null && cached.count === 1,
          "incrementReactionTally should cache",
        );

        const read = await readReactionTally(key);
        assert(
          read !== null && read.count === 1,
          "readReactionTally should return cached",
        );

        const dec = await decrementReactionTally(key);
        assert(
          dec !== null && dec.count === 0,
          "decrementReactionTally should reduce to zero",
        );

        const cachedAfterDec = getTally(key);
        assertEqual(
          cachedAfterDec,
          null,
          "decrementReactionTally should drop cache",
        );

        await incrementReactionTally(key, userId);
        await removeReactionTally(key);
        const cachedAfterRemove = getTally(key);
        assertEqual(
          cachedAfterRemove,
          null,
          "removeReactionTally should clear cache",
        );
      },
    },
    {
      name: "drain message state and presence",
      ops: [ops.delete, ops.cache],
      run: async ({ factory }) => {
        const guildId = factory.guildId();
        const messageId = factory.messageId();
        const presenceKey = {
          guildId,
          messageId,
          emojiKey: "smile",
          userId: factory.userId(),
        };
        trackPresence(presenceKey);

        const tallyKeyOne = { guildId, messageId, emojiKey: "smile" };
        const tallyKeyTwo = { guildId, messageId, emojiKey: "heart" };
        await incrementReactionTally(tallyKeyOne, factory.userId());
        await incrementReactionTally(tallyKeyTwo, factory.userId());

        const drained = await drainMessageState(guildId, messageId);
        assertEqual(
          drained.presence.length,
          1,
          "drainMessageState should return presence",
        );
        assert(
          drained.tallies.length >= 2,
          "drainMessageState should return tallies",
        );
        assertEqual(
          getTally(tallyKeyOne),
          null,
          "drainMessageState should clear cache",
        );

        const messageIdTwo = factory.messageId();
        const presenceKeyTwo = {
          guildId,
          messageId: messageIdTwo,
          emojiKey: "star",
          userId: factory.userId(),
        };
        trackPresence(presenceKeyTwo);
        clearTrackedPresence(presenceKeyTwo);

        const drainedEmpty = await drainMessageState(guildId, messageIdTwo);
        assertEqual(
          drainedEmpty.presence.length,
          0,
          "clearTrackedPresence should remove presence",
        );
      },
    },
  ],
};
