import { deleteGuild } from "../../src/db/repositories/guilds";
import { ensureGuild, getGuild, withGuild } from "../../src/db/repositories/with_guild";
import {
  assert,
  assertDeepEqual,
  assertEqual,
  ops,
  type Suite,
} from "./_utils";

export const suite: Suite = {
  name: "with_guild repo",
  tests: [
    {
      name: "ensure and get",
      ops: [ops.create, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanup.add(async () => {
          await deleteGuild(guildId);
        });
        const missing = await getGuild(guildId);
        assertEqual(missing, null, "getGuild should return null when missing");

        const ensured = await ensureGuild(guildId);
        assertEqual(ensured._id, guildId, "ensureGuild should create guild");

        const fetched = await getGuild(guildId);
        assert(fetched !== null && fetched._id === guildId, "getGuild should return guild");
      },
    },
    {
      name: "withGuild mutation",
      ops: [ops.update, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanup.add(async () => {
          await deleteGuild(guildId);
        });
        await ensureGuild(guildId);

        const result = await withGuild(guildId, (guild) => {
          guild.reputation = { keywords: ["alpha"] };
          guild.channels.ticketMessageId = "ticket-msg";
          return "ok";
        });

        assertEqual(result, "ok", "withGuild should return callback result");

        const updated = await getGuild(guildId);
        assert(updated !== null, "getGuild should return after withGuild");
        assertDeepEqual(
          updated?.reputation.keywords ?? [],
          ["alpha"],
          "withGuild should persist changes",
        );
        assertEqual(
          updated?.channels.ticketMessageId ?? null,
          "ticket-msg",
          "withGuild should persist channels",
        );
      },
    },
  ],
};
