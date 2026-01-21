import { GuildStore, updateGuildPaths } from "../../src/db/repositories/guilds";
import { assert, assertDeepEqual, ops, type Suite } from "./_utils";

export const suite: Suite = {
  name: "automod whitelist config",
  tests: [
    {
      name: "updateGuildPaths can set automod.domainWhitelist",
      ops: [ops.update, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanup.add(async () => {
          await GuildStore.delete(guildId);
        });

        await updateGuildPaths(guildId, {
          "automod.domainWhitelist": {
            enabled: true,
            domains: ["example.com", "sub.domain.test"],
          },
        });

        const guildRes = await GuildStore.get(guildId);
        const guild = guildRes.unwrap();
        assert(guild !== null, "guild should exist");

        assertDeepEqual(
          (guild as any).automod?.domainWhitelist,
          {
            enabled: true,
            domains: ["example.com", "sub.domain.test"],
          },
          "guild.automod.domainWhitelist should persist",
        );
      },
    },
  ],
};
