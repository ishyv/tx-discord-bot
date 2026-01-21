import { GuildStore, updateGuildPaths } from "../../src/db/repositories/guilds";
import { assert, assertDeepEqual, ops, type Suite } from "./_utils";

export const suite: Suite = {
  name: "automod linkspam config",
  tests: [
    {
      name: "updateGuildPaths can set automod.linkSpam",
      ops: [ops.update, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanup.add(async () => {
          await GuildStore.delete(guildId);
        });

        await updateGuildPaths(guildId, {
          "automod.linkSpam": {
            enabled: true,
            maxLinks: 2,
            windowSeconds: 10,
            timeoutSeconds: 300,
            action: "timeout",
            reportChannelId: null,
          },
        });

        const guildRes = await GuildStore.get(guildId);
        const guild = guildRes.unwrap();
        assert(guild !== null, "guild should exist");

        assertDeepEqual(
          (guild as any).automod?.linkSpam,
          {
            enabled: true,
            maxLinks: 2,
            windowSeconds: 10,
            timeoutSeconds: 300,
            action: "timeout",
            reportChannelId: null,
          },
          "guild.automod.linkSpam should persist",
        );
      },
    },
  ],
};
