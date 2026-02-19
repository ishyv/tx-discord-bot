/**
 * Channel Set Command.
 *
 * Purpose: Update one of the required core channels.
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
  CORE_CHANNEL_DEFINITIONS,
  type CoreChannelName,
  removeInvalidChannels,
  setCoreChannel,
} from "@/modules/guild-channels";
import { Guard } from "@/middlewares/guards/decorator";
import { CoreChannelNames } from "@/modules/guild-channels/constants";
import { ensureTicketMessage } from "@/systems/tickets";

const nameChoices = Object.entries(CORE_CHANNEL_DEFINITIONS).map(
  ([name, label]) => ({
    name: `${name} (${label})`,
    value: name,
  }),
);

const options = {
  name: createStringOption({
    description: "Name of the required channel",
    required: true,
    choices: nameChoices,
  }),
  channel: createChannelOption({
    description: "Discord channel to associate",
    required: true,
  }),
};

@HelpDoc({
  command: "channels set",
  category: HelpCategory.Moderation,
  description: "Update one of the required core channels used by the bot",
  usage: "/channels set <name> <channel>",
  permissions: ["ManageChannels"],
})
@Declare({
  name: "set",
  description: "Update one of the required channels",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
})
@Options(options)
@Guard({
  guildOnly: true,
})
@Middlewares(["guard"])
export default class ChannelSetCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;

    // Removal of invalid channels before proceeding.
    await removeInvalidChannels(guildId, ctx.client);

    const name = ctx.options.name as CoreChannelName;
    const channelId = String(ctx.options.channel.id);

    const record = await setCoreChannel(guildId, name, channelId);

    // When the tickets channel is updated, ensure the ticket message exists.
    if (name === CoreChannelNames.Tickets) {
      await ensureTicketMessage(ctx.client).catch(() => {
        // do nothing if it fails; the message will be retried on next restart or reconfiguration
      });
    }

    const embed = new Embed({
      title: "Channel updated",
      description: `Assigned <#${record.channelId}> to **${name}** (${CORE_CHANNEL_DEFINITIONS[name]})`,
      color: UIColors.success,
    });

    await ctx.write({ embeds: [embed] });
  }
}
