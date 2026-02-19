/**
 * Forums Remove Command.
 *
 * Purpose: Remove a monitored forum for AI-powered automatic replies.
 */
import type { GuildCommandContext } from "seyfert";
import {
  Declare,
  Options,
  SubCommand,
  createChannelOption,
  Middlewares,
} from "seyfert";
import { ChannelType } from "seyfert/lib/types";
import { HelpDoc, HelpCategory } from "@/modules/help";

import { configStore, ConfigurableModule } from "@/configuration";
import { Guard } from "@/middlewares/guards/decorator";

const options = {
  forum: createChannelOption({
    description: "Discord forum to stop monitoring",
    required: true,
    channel_types: [ChannelType.GuildForum],
  }),
};

@HelpDoc({
  command: "forums remove",
  category: HelpCategory.Moderation,
  description: "Remove a forum channel from AI monitoring",
  usage: "/forums remove <channel>",
  permissions: ["ManageChannels"],
})
@Declare({
  name: "remove",
  description: "Remove a monitored forum",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
})
@Options(options)
@Guard({
  guildOnly: true,
})
@Middlewares(["guard"])
export default class ForumsRemoveCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;

    const forum = ctx.options.forum;
    if (!forum || forum.type !== ChannelType.GuildForum) {
      await ctx.write({
        content: "You must choose a valid forum channel.",
      });
      return;
    }

    const { forumIds } = await configStore.get(
      guildId,
      ConfigurableModule.ForumAutoReply,
    );

    if (!forumIds.includes(forum.id)) {
      await ctx.write({
        content: `The forum <#${forum.id}> is not in the configured list.`,
      });
      return;
    }

    const next = forumIds.filter((id: string) => id !== forum.id);
    await configStore.set(guildId, ConfigurableModule.ForumAutoReply, {
      forumIds: next,
    });

    await ctx.write({
      content: `Forum removed: <#${forum.id}>. Total: ${next.length}.`,
    });
  }
}
