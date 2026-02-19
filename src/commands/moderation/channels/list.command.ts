/**
 * Channel List Command.
 *
 * Purpose: List current core and optional channels.
 */
import type { GuildCommandContext } from "seyfert";
import { Declare, Embed, SubCommand, Middlewares } from "seyfert";
import { UIColors } from "@/modules/ui/design-system";
import {
  CORE_CHANNEL_DEFINITIONS,
  getGuildChannels,
  removeInvalidChannels,
} from "@/modules/guild-channels";
import { Guard } from "@/middlewares/guards/decorator";
import { HelpDoc, HelpCategory } from "@/modules/help";

function formatChannelMention(channelId: string): string {
  return channelId ? `<#${channelId}>` : "No channel";
}

@HelpDoc({
  command: "channels list",
  category: HelpCategory.Moderation,
  description: "Show the status of all configured core and optional channels",
  usage: "/channels list",
  permissions: ["ManageChannels"],
})
@Declare({
  name: "list",
  description: "Show the status of configured channels",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
})
@Guard({
  guildOnly: true,
})
@Middlewares(["guard"])
export default class ChannelListCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const guildId = ctx.guildId;

    // Remove invalid channels before proceeding.
    await removeInvalidChannels(guildId, ctx.client);

    const guild_channels_record = await getGuildChannels(guildId);

    const coreLines = Object.entries(CORE_CHANNEL_DEFINITIONS)
      .map(([name, label]) => {
        const entry = guild_channels_record.core?.[name] as
          | { channelId: string }
          | null
          | undefined;
        if (!entry) {
          return `**${name}** (${label}) -> No channel`;
        }
        return `**${name}** (${label}) -> ${formatChannelMention(entry.channelId)}`;
      })
      .join("\n\n");

    const managedEntries = Object.values(
      guild_channels_record.managed ?? {},
    ) as any[];
    const managedLines = managedEntries.length
      ? managedEntries
        .map(
          (entry) =>
            `**${entry.id}** (${entry.label}) -> ${formatChannelMention(entry.channelId)}`,
        )
        .join("\n")
      : "No optional channels configured.";

    const embed = new Embed({
      title: "Channels Configuration",
      color: UIColors.info,
      fields: [
        {
          name: "Required Channels",
          value: coreLines,
        },
        {
          name: "Optional Channels",
          value: managedLines,
        },
      ],
    });

    await ctx.write({ embeds: [embed] });
  }
}
