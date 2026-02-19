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
    description: "Enable or disable domain whitelist",
    required: false,
  }),
  add: createStringOption({
    description: "Domain to add (e.g., github.com)",
    required: false,
  }),
  remove: createStringOption({
    description: "Domain to remove",
    required: false,
  }),
};

const DOMAIN_PATTERN = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

@Options(options)
@HelpDoc({
  command: "automod whitelist",
  category: HelpCategory.Moderation,
  description: "Configure the AutoMod domain whitelist — add or remove allowed domains",
  usage: "/automod whitelist [enabled] [add] [remove]",
  examples: ["/automod whitelist add github.com"],
  permissions: ["ManageGuild"],
})
@Declare({
  name: "whitelist",
  description: "Configure domain whitelist for AutoMod",
})
@Guard({
  guildOnly: true,
  permissions: ["ManageGuild"],
})
@Middlewares(["guard"])
export default class AutomodWhitelistCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    const { enabled, add, remove } = ctx.options;

    if (enabled === undefined && add === undefined && remove === undefined) {
      const config = await configStore.get(
        guildId,
        ConfigurableModule.AutomodDomainWhitelist,
      );
      await ctx.write({
        content:
          `**AutoMod Domain Whitelist:**\n` +
          `- Status: ${config.enabled ? "✅ Enabled" : "❌ Disabled"}\n` +
          `- Domains: ${config.domains.length ? config.domains.join(", ") : "(empty)"}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const current = await configStore.get(
      guildId,
      ConfigurableModule.AutomodDomainWhitelist,
    );

    const nextDomains = new Set(
      (current.domains ?? []).map((d: string) => d.toLowerCase().trim()),
    );

    if (add) {
      const domain = add.toLowerCase().trim();
      if (!DOMAIN_PATTERN.test(domain)) {
        await ctx.write({
          content: "Invalid domain. Use a format like `github.com`.",
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
      domains: Array.from(nextDomains),
    };
    if (enabled !== undefined) updates.enabled = enabled;

    await configStore.set(
      guildId,
      ConfigurableModule.AutomodDomainWhitelist,
      updates,
    );

    const updated = await configStore.get(
      guildId,
      ConfigurableModule.AutomodDomainWhitelist,
    );

    await ctx.write({
      content:
        `**AutoMod Domain Whitelist updated:**\n` +
        `- Status: ${updated.enabled ? "✅ Enabled" : "❌ Disabled"}\n` +
        `- Domains: ${updated.domains.length ? updated.domains.join(", ") : "(empty)"}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
