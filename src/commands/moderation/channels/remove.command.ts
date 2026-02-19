/**
 * Channel Remove Command.
 *
 * Purpose: Remove a previously registered optional channel.
 */
import type { GuildCommandContext } from "seyfert";
import {
  Declare,
  Embed,
  Options,
  SubCommand,
  createStringOption,
  Middlewares,
} from "seyfert";
import { UIColors } from "@/modules/ui/design-system";
import { HelpDoc, HelpCategory } from "@/modules/help";
import {
  removeInvalidChannels,
  removeManagedChannel,
} from "@/modules/guild-channels";
import { Guard } from "@/middlewares/guards/decorator";

const options = {
  id: createStringOption({
    description: "Optional channel identifier",
    required: true,
  }),
};

@HelpDoc({
  command: "channels remove",
  category: HelpCategory.Moderation,
  description: "Remove a previously registered optional channel from the bot",
  usage: "/channels remove <name>",
  permissions: ["ManageChannels"],
})
@Declare({
  name: "remove",
  description: "Remove an optional channel",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
})
@Options(options)
@Guard({
  guildOnly: true,
})
@Middlewares(["guard"])
export default class ChannelRemoveCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;

    const identifier = ctx.options.id.trim();
    if (!identifier) {
      await ctx.write({
        content: "[!] You must specify a valid identifier.",
      });
      return;
    }

    // Remove invalid channels before proceeding.
    await removeInvalidChannels(guildId, ctx.client);

    const removed = await removeManagedChannel(guildId, identifier);

    if (!removed) {
      await ctx.write({
        content: "[!] No channel found with that identifier.",
      });
      return;
    }

    const embed = new Embed({
      title: "Optional channel removed",
      description: `Reference **${identifier}** was removed`,
      color: UIColors.error,
    });

    await ctx.write({ embeds: [embed] });
  }
}
