import { GuildStore, updateGuildPaths } from "../../src/db/repositories/guilds";
import { assert, assertDeepEqual, ops, type Suite } from "./_utils";

export const suite: Suite = {
  name: "automod report channel config",
  tests: [
    {
      name: "updateGuildPaths can set automod.linkSpam.reportChannelId",
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
            action: "report",
            reportChannelId: "123456789012345678",
          },
        });

        const guildRes = await GuildStore.get(guildId);
        const guild = guildRes.unwrap();
        assert(guild !== null, "guild should exist");

        assertDeepEqual(
          (guild as any).automod?.linkSpam?.reportChannelId,
          "123456789012345678",
          "guild.automod.linkSpam.reportChannelId should persist",
        );
      },
    },
  ],
};
