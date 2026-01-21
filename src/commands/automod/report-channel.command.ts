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
    description: "Canal donde enviar reportes de AutoMod",
    required: false,
    channel_types: [ChannelType.GuildText],
  }),
  clear: createBooleanOption({
    description: "Quitar canal de reportes",
    required: false,
  }),
};

@Options(options)
@Declare({
  name: "reportchannel",
  description: "Configurar el canal de reportes de AutoMod",
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
      const config = await configStore.get(guildId, ConfigurableModule.AutomodLinkSpam);
      await ctx.write({
        content: `**AutoMod reportes:** ${
          config.reportChannelId ? `<#${config.reportChannelId}>` : "(no configurado)"
        }`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const current = await configStore.get(guildId, ConfigurableModule.AutomodLinkSpam);
    const updates: Partial<typeof current> = {};
    if (clear) {
      updates.reportChannelId = null;
    }
    if (channel) {
      if (!isSnowflake(channel.id)) {
        await ctx.write({
          content: "Canal invalido. El ID no es un snowflake valido.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      updates.reportChannelId = channel.id;
    }

    await configStore.set(guildId, ConfigurableModule.AutomodLinkSpam, updates);
    const updated = await configStore.get(guildId, ConfigurableModule.AutomodLinkSpam);

    await ctx.write({
      content: `**AutoMod reportes actualizado:** ${
        updated.reportChannelId ? `<#${updated.reportChannelId}>` : "(no configurado)"
      }`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
