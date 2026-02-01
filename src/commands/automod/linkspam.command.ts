import type { GuildCommandContext } from "seyfert";
import {
  Middlewares,
  Options,
  SubCommand,
  createBooleanOption,
  createChannelOption,
  createIntegerOption,
  createStringOption,
  Declare,
} from "seyfert";
import { ChannelType, MessageFlags } from "seyfert/lib/types";
import { configStore, ConfigurableModule } from "@/configuration";
import { Guard } from "@/middlewares/guards/decorator";

const options = {
  enabled: createBooleanOption({
    description: "Enable or disable linkspam automod",
    required: false,
  }),
  max_links: createIntegerOption({
    description: "Maximum links allowed within the window",
    required: false,
    min_value: 1,
  }),
  window_seconds: createIntegerOption({
    description: "Time window in seconds",
    required: false,
    min_value: 1,
  }),
  timeout_seconds: createIntegerOption({
    description: "Timeout in seconds when triggered (if bot can)",
    required: false,
    min_value: 1,
  }),
  action: createStringOption({
    description: "Action when spam is detected (timeout, mute, delete, report)",
    required: false,
    choices: [
      { name: "timeout", value: "timeout" },
      { name: "mute", value: "mute" },
      { name: "delete", value: "delete" },
      { name: "report", value: "report" },
    ],
  }),
  report_channel: createChannelOption({
    description: "Channel for reports when action=report",
    required: false,
    channel_types: [ChannelType.GuildText],
  }),
};

@Declare({
  name: "linkspam",
  description: "Configure link spam filter",
})
@Options(options)
@Guard({
  guildOnly: true,
  permissions: ["ManageGuild"],
})
@Middlewares(["guard"])
export default class AutomodLinkSpamCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;

    const {
      enabled,
      max_links,
      window_seconds,
      timeout_seconds,
      action,
      report_channel,
    } = ctx.options;

    if (
      enabled === undefined &&
      max_links === undefined &&
      window_seconds === undefined &&
      timeout_seconds === undefined &&
      action === undefined &&
      report_channel === undefined
    ) {
      const config = await configStore.get(
        guildId,
        ConfigurableModule.AutomodLinkSpam,
      );
      await ctx.write({
        content:
          `**AutoMod LinkSpam:**\n` +
          `- Status: ${config.enabled ? "✅ Enabled" : "❌ Disabled"}\n` +
          `- Max links: \`${config.maxLinks}\`\n` +
          `- Window: \`${config.windowSeconds}\`s\n` +
          `- Timeout: \`${config.timeoutSeconds}\`s\n` +
          `- Action: \`${config.action}\`\n` +
          `- Report channel: ${config.reportChannelId ? `<#${config.reportChannelId}>` : "(not configured)"}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const current = await configStore.get(
      guildId,
      ConfigurableModule.AutomodLinkSpam,
    );
    const updates: Partial<typeof current> = {};
    if (enabled !== undefined) updates.enabled = enabled;
    if (max_links !== undefined) updates.maxLinks = max_links;
    if (window_seconds !== undefined) updates.windowSeconds = window_seconds;
    if (timeout_seconds !== undefined) updates.timeoutSeconds = timeout_seconds;
    if (action !== undefined) updates.action = action as typeof current.action;
    if (report_channel !== undefined)
      updates.reportChannelId = report_channel.id;

    await configStore.set(guildId, ConfigurableModule.AutomodLinkSpam, updates);
    const updated = await configStore.get(
      guildId,
      ConfigurableModule.AutomodLinkSpam,
    );

    await ctx.write({
      content:
        `**AutoMod LinkSpam updated:**\n` +
        `- Status: ${updated.enabled ? "✅ Enabled" : "❌ Disabled"}\n` +
        `- Max links: \`${updated.maxLinks}\`\n` +
        `- Window: \`${updated.windowSeconds}\`s\n` +
        `- Timeout: \`${updated.timeoutSeconds}\`s\n` +
        `- Action: \`${updated.action}\`\n` +
        `- Report channel: ${updated.reportChannelId ? `<#${updated.reportChannelId}>` : "(not configured)"}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
