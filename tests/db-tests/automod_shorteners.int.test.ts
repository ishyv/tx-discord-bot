import { GuildStore, updateGuildPaths } from "../../src/db/repositories/guilds";
import { assert, assertDeepEqual, ops, type Suite } from "./_utils";

export const suite: Suite = {
  name: "automod shorteners config",
  tests: [
    {
      name: "updateGuildPaths can set automod.shorteners",
      ops: [ops.update, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanup.add(async () => {
          await GuildStore.delete(guildId);
        });

        await updateGuildPaths(guildId, {
          "automod.shorteners": {
            enabled: true,
            resolveFinalUrl: true,
            allowedShorteners: ["bit.ly"],
          },
        });

        const guildRes = await GuildStore.get(guildId);
        const guild = guildRes.unwrap();
        assert(guild !== null, "guild should exist");

        assertDeepEqual(
          (guild as any).automod?.shorteners,
          {
            enabled: true,
            resolveFinalUrl: true,
            allowedShorteners: ["bit.ly"],
          },
          "guild.automod.shorteners should persist",
        );
      },
    },
  ],
};
