/**
 * Forums Add Command.
 *
 * Purpose: Add monitored forums for AI-powered automatic replies.
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
    description: "Discord forum to monitor",
    required: true,
    channel_types: [ChannelType.GuildForum],
  }),
};

@HelpDoc({
  command: "forums add",
  category: HelpCategory.Moderation,
  description: "Add a forum channel for AI-powered automatic replies",
  usage: "/forums add <channel>",
  permissions: ["ManageChannels"],
})
@Declare({
  name: "add",
  description: "Add a monitored forum for automatic replies (AI)",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
})
@Options(options)
@Guard({
  guildOnly: true,
})
@Middlewares(["guard"])
export default class ForumsAddCommand extends SubCommand {
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

    if (forumIds.includes(forum.id)) {
      await ctx.write({
        content: `The forum <#${forum.id}> is already configured.`,
      });
      return;
    }

    const next = Array.from(new Set([...forumIds, forum.id]));
    await configStore.set(guildId, ConfigurableModule.ForumAutoReply, {
      forumIds: next,
    });

    await ctx.write({
      content: `Forum added: <#${forum.id}>. Total: ${next.length}.`,
    });
  }
}
