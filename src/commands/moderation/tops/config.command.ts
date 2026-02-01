/**
 * Tops Config Command.
 *
 * Purpose: Enable and adjust the TOPs system per server.
 */
import {
  createBooleanOption,
  createChannelOption,
  createNumberOption,
  createStringOption,
  Declare,
  type GuildCommandContext,
  Options,
  SubCommand,
  Middlewares,
} from "seyfert";
import { ChannelType, MessageFlags } from "seyfert/lib/types";

import {
  getTopWindow,
  resetTopWindow,
  updateTopConfig,
} from "@/db/repositories";
import { TOP_DEFAULTS } from "@/db/schemas/tops";
import { Guard } from "@/middlewares/guards/decorator";
import * as duration from "@/utils/ms";

const options = {
  channel: createChannelOption({
    description: "Channel where TOPs reports will be published",
    required: false,
    channel_types: [ChannelType.GuildText],
  }),
  interval: createStringOption({
    description: "How often the report is sent (e.g. 24h, 3d, 1w)",
    required: false,
  }),
  size: createNumberOption({
    description: "Maximum number of elements per TOP (default 10)",
    required: false,
    min_value: 1,
    max_value: 50,
  }),
  disable: createBooleanOption({
    description: "Deactivates the system and clears the configured channel",
    required: false,
  }),
  reset: createBooleanOption({
    description: "Reset counters from zero with the new config",
    required: false,
  }),
};

const MIN_INTERVAL_MS = 10 * 60 * 1000; // 10 minutos para evitar spam accidental

@Declare({
  name: "config",
  description: "Configure the tops system",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
})
@Options(options)
@Guard({
  guildOnly: true,
})
@Middlewares(["guard"])
export default class ConfigTopsCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const currentWindow = await getTopWindow(guildId);
    const disable = ctx.options.disable ?? false;
    if (disable) {
      await updateTopConfig(guildId, { channelId: null });
      await ctx.write({
        content:
          "TOPs system disabled. No new reports will be sent until a channel is configured again.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = ctx.options.channel;
    const intervalInput = ctx.options.interval;
    if (!channel || !intervalInput) {
      await ctx.write({
        content:
          "You must specify a channel and an interval (e.g. `24h`, `3d`, `1w`).",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const intervalMs = duration.parse(intervalInput);
    if (!intervalMs || intervalMs < MIN_INTERVAL_MS) {
      await ctx.write({
        content: `Invalid interval. Use values like \`12h\`, \`3d\`, \`1w\`. Minimum allowed: ${duration.format(MIN_INTERVAL_MS)}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const topSize =
      ctx.options.size && ctx.options.size > 0
        ? Math.min(Math.trunc(ctx.options.size), 50)
        : TOP_DEFAULTS.topSize;

    await updateTopConfig(guildId, {
      channelId: channel.id,
      intervalMs,
      topSize,
    });

    let resetNote = "";
    const shouldReset =
      ctx.options.reset === true || !currentWindow.channelId;
    if (shouldReset) {
      await resetTopWindow(guildId, new Date());
      resetNote =
        "\nThe current window was reset to start counting from now.";
    }

    await ctx.write({
      content: [
        "TOPs configuration saved.",
        `Channel: <#${channel.id}>`,
        `Interval: ${duration.format(intervalMs, true)}`,
        `TOP Size: ${topSize}`,
        resetNote,
      ]
        .filter(Boolean)
        .join("\n"),
      flags: MessageFlags.Ephemeral,
    });
  }
}
