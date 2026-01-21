import { enqueueRoleGrant, enqueueRoleRevoke } from "../../src/modules/autorole/engine/roleOps";
import { assertEqual, ops, type Suite } from "./_utils";

type CallLog = { add: number; remove: number };

export const suite: Suite = {
  name: "autorole roleOps",
  tests: [
    {
      name: "skip addRole/removeRole when ids are not snowflakes",
      ops: [ops.other],
      run: async () => {
        const calls: CallLog = { add: 0, remove: 0 };

        const client = {
          members: {
            addRole: async () => {
              calls.add += 1;
            },
            removeRole: async () => {
              calls.remove += 1;
            },
          },
          logger: {
            warn: () => undefined,
            debug: () => undefined,
            error: () => undefined,
          },
        } as any;

        await enqueueRoleGrant(client, {
          guildId: "guild-not-snowflake",
          userId: "user-not-snowflake",
          roleId: "role-not-snowflake",
          reason: "test",
        });

        await enqueueRoleRevoke(client, {
          guildId: "guild-not-snowflake",
          userId: "user-not-snowflake",
          roleId: "role-not-snowflake",
          reason: "test",
        });

        assertEqual(calls.add, 0, "addRole should not be called");
        assertEqual(calls.remove, 0, "removeRole should not be called");
      },
    },
  ],
};
