import type { GuildCommandContext } from "seyfert";
import {
  createBooleanOption,
  createStringOption,
  Declare,
  Options,
  SubCommand,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { configStore, ConfigurableModule } from "@/configuration";
import { Guard } from "@/middlewares/guards/decorator";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { Middlewares } from "seyfert";

const options = {
  enabled: createBooleanOption({
    description: "Enable shortener detection",
    required: false,
  }),
  resolve_final_url: createBooleanOption({
    description: "Resolve final URL (more expensive)",
    required: false,
  }),
  add: createStringOption({
    description: "Shortener domain to add (e.g., bit.ly)",
    required: false,
  }),
  remove: createStringOption({
    description: "Shortener domain to remove",
    required: false,
  }),
};

const DOMAIN_PATTERN = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

@Options(options)
@HelpDoc({
  command: "automod shorteners",
  category: HelpCategory.Moderation,
  description: "Configure link shortener detection — enable/disable and set URL resolution",
  usage: "/automod shorteners [enabled] [resolve_final_url]",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "shorteners",
  description: "Configure link shortener detection",
})
@Guard({
  guildOnly: true,
  permissions: ["ManageGuild"],
})
@Middlewares(["guard"])
export default class AutomodShortenersCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    const { enabled, resolve_final_url, add, remove } = ctx.options;

    if (
      enabled === undefined &&
      resolve_final_url === undefined &&
      add === undefined &&
      remove === undefined
    ) {
      const config = await configStore.get(
        guildId,
        ConfigurableModule.AutomodShorteners,
      );
      await ctx.write({
        content:
          `**AutoMod Shorteners:**\n` +
          `- Status: ${config.enabled ? "✅ Enabled" : "❌ Disabled"}\n` +
          `- Resolve final URL: ${config.resolveFinalUrl ? "✅" : "❌"}\n` +
          `- Domains: ${config.allowedShorteners.join(", ")}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const current = await configStore.get(
      guildId,
      ConfigurableModule.AutomodShorteners,
    );

    const nextDomains = new Set(
      (current.allowedShorteners ?? []).map((d: string) =>
        d.toLowerCase().trim(),
      ),
    );

    if (add) {
      const domain = add.toLowerCase().trim();
      if (!DOMAIN_PATTERN.test(domain)) {
        await ctx.write({
          content: "Invalid domain. Use a format like `bit.ly`.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      nextDomains.add(domain);
    }

    if (remove) {
      const domain = remove.toLowerCase().trim();
      nextDomains.delete(domain);
    }

    const updates: Partial<typeof current> = {
      allowedShorteners: Array.from(nextDomains),
    };
    if (enabled !== undefined) updates.enabled = enabled;
    if (resolve_final_url !== undefined)
      updates.resolveFinalUrl = resolve_final_url;

    await configStore.set(
      guildId,
      ConfigurableModule.AutomodShorteners,
      updates,
    );
    const updated = await configStore.get(
      guildId,
      ConfigurableModule.AutomodShorteners,
    );

    await ctx.write({
      content:
        `**AutoMod Shorteners updated:**\n` +
        `- Status: ${updated.enabled ? "✅ Enabled" : "❌ Disabled"}\n` +
        `- Resolve final URL: ${updated.resolveFinalUrl ? "✅" : "❌"}\n` +
        `- Domains: ${updated.allowedShorteners.join(", ")}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
