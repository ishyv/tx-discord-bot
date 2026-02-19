/**
 * AI Rate Limit Command.
 *
 * Purpose: Configure AI rate limits per guild.
 */
import {
  Declare,
  Options,
  SubCommand,
  createBooleanOption,
  createIntegerOption,
  Middlewares,
} from "seyfert";
import type { GuildCommandContext } from "seyfert";
import { configStore, ConfigurableModule } from "@/configuration";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { Guard } from "@/middlewares/guards/decorator";

const options = {
  enabled: createBooleanOption({
    description: "Enable or disable the rate limit",
    required: false,
  }),
  max: createIntegerOption({
    description: "Maximum allowed requests",
    required: false,
    min_value: 1,
  }),
  window: createIntegerOption({
    description: "Time window in seconds",
    required: false,
    min_value: 10,
  }),
};

@HelpDoc({
  command: "ai ratelimit",
  category: HelpCategory.AI,
  description: "Configure the AI rate limit settings for this server",
  usage: "/ai ratelimit [enabled] [limit]",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "ratelimit",
  description: "Configure AI rate limit",
})
@Options(options)
@Guard({
  guildOnly: true,
})
@Middlewares(["guard"])
export default class AiRateLimitCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;

    const { enabled, max, window } = ctx.options;

    // If no options passed, show current config
    if (enabled === undefined && max === undefined && window === undefined) {
      const config = await configStore.get(guildId, ConfigurableModule.AI);
      await ctx.write({
        content:
          `**AI Rate Limit Configuration:**\n` +
          `- Status: ${config.rateLimitEnabled ? "✅ Enabled" : "❌ Disabled"}\n` +
          `- Maximum: \`${config.rateLimitMax}\` requests\n` +
          `- Window: \`${config.rateLimitWindow}\` seconds`,
      });
      return;
    }

    const current = await configStore.get(guildId, ConfigurableModule.AI);

    const updates: Partial<typeof current> = {};
    if (enabled !== undefined) updates.rateLimitEnabled = enabled;
    if (max !== undefined) updates.rateLimitMax = max;
    if (window !== undefined) updates.rateLimitWindow = window;

    await configStore.set(guildId, ConfigurableModule.AI, updates);

    const updated = await configStore.get(guildId, ConfigurableModule.AI);

    await ctx.write({
      content:
        `**AI Rate Limit updated:**\n` +
        `- Status: ${updated.rateLimitEnabled ? "✅ Enabled" : "❌ Disabled"}\n` +
        `- Maximum: \`${updated.rateLimitMax}\` requests\n` +
        `- Window: \`${updated.rateLimitWindow}\` seconds`,
    });
  }
}
