/**
 * Channel Add Command.
 *
 * Purpose: Register an auxiliary channel defined by the staff.
 */
import type { GuildCommandContext } from "seyfert";
import {
  Declare,
  Embed,
  Options,
  SubCommand,
  createChannelOption,
  createStringOption,
  Middlewares,
} from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { UIColors } from "@/modules/ui/design-system";
import {
  addManagedChannel,
  removeInvalidChannels,
} from "@/modules/guild-channels";
import { Guard } from "@/middlewares/guards/decorator";

const options = {
  label: createStringOption({
    description: "Short description of the channel",
    required: true,
  }),
  channel: createChannelOption({
    description: "Discord channel to register",
    required: true,
  }),
};

@HelpDoc({
  command: "channels add",
  category: HelpCategory.Moderation,
  description: "Register an optional auxiliary channel for the bot",
  usage: "/channels add <name> <channel>",
  permissions: ["ManageChannels"],
})
@Declare({
  name: "add",
  description: "Register an optional channel",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
})
@Options(options)
@Guard({
  guildOnly: true,
})
@Middlewares(["guard"])
export default class ChannelAddCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;

    // Remove invalid channels before proceeding.
    await removeInvalidChannels(guildId, ctx.client);

    const label = ctx.options.label;
    const channelId = String(ctx.options.channel.id);

    const record = await addManagedChannel(guildId, label, channelId);

    const embed = new Embed({
      title: "Optional channel registered",
      description: `Assigned <#${record.channelId}> with label **${record.label}**`,
      color: UIColors.success,
      fields: [
        {
          name: "Identifier",
          value: record.id,
        },
      ],
    });

    await ctx.write({ embeds: [embed] });
  }
}
