import type { GuildCommandContext } from "seyfert";
import {
  createBooleanOption,
  createChannelOption,
  Declare,
  Options,
  SubCommand,
} from "seyfert";
import { ChannelType, MessageFlags } from "seyfert/lib/types";
import { configStore, ConfigurableModule } from "@/configuration";
import { Guard } from "@/middlewares/guards/decorator";
import { Middlewares } from "seyfert";
import { isSnowflake } from "@/utils/snowflake";

const options = {
  channel: createChannelOption({
    description: "Channel where AutoMod reports will be sent",
    required: false,
    channel_types: [ChannelType.GuildText],
  }),
  clear: createBooleanOption({
    description: "Remove reports channel",
    required: false,
  }),
};

@Options(options)
@Declare({
  name: "reportchannel",
  description: "Configure the AutoMod reports channel",
})
@Guard({
  guildOnly: true,
  permissions: ["ManageGuild"],
})
@Middlewares(["guard"])
export default class AutomodReportChannelCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    const { channel, clear } = ctx.options;

    if (!channel && !clear) {
      const config = await configStore.get(
        guildId,
        ConfigurableModule.AutomodLinkSpam,
      );
      await ctx.write({
        content: `**AutoMod reports:** ${config.reportChannelId
            ? `<#${config.reportChannelId}>`
            : "(not configured)"
          }`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const current = await configStore.get(
      guildId,
      ConfigurableModule.AutomodLinkSpam,
    );
    const updates: Partial<typeof current> = {};
    if (clear) {
      updates.reportChannelId = null;
    }
    if (channel) {
      if (!isSnowflake(channel.id)) {
        await ctx.write({
          content: "Invalid channel. The ID is not a valid snowflake.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      updates.reportChannelId = channel.id;
    }

    await configStore.set(guildId, ConfigurableModule.AutomodLinkSpam, updates);
    const updated = await configStore.get(
      guildId,
      ConfigurableModule.AutomodLinkSpam,
    );

    await ctx.write({
      content: `**AutoMod reports updated:** ${updated.reportChannelId
          ? `<#${updated.reportChannelId}>`
          : "(not configured)"
        }`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
