import {
  createBooleanOption,
  createStringOption,
  Declare,
  GuildCommandContext,
  Options,
  SubCommand,
  Middlewares,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { setFeatureFlag } from "@/modules/features";
import { Guard } from "@/middlewares/guards/decorator";
import { Features } from "@/modules/features";
import { configStore, ConfigurableModule } from "@/configuration";
import { HelpDoc, HelpCategory } from "@/modules/help";

const options = {
  keywords: createStringOption({
    description: "List of keywords separated by commas",
    required: true,
  }),
};

@HelpDoc({
  command: "rep keywords",
  category: HelpCategory.Moderation,
  description: "Configure keywords that trigger automatic reputation detection",
  usage: "/rep keywords [add] [remove]",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "keywords",
  description: "Configure reputation keywords",
})
@Options(options)
@Guard({
  guildOnly: true,
  feature: Features.Reputation,
  permissions: ["ManageGuild"],
})
@Middlewares(["guard"])
export default class RepConfigKeywordsCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;

    const { keywords: keywordsInput } = ctx.options;
    const keywords = keywordsInput
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean);

    await configStore.set(guildId, ConfigurableModule.Reputation, { keywords });

    await ctx.write({
      content: `Reputation keywords have been updated: ${keywords.map((k) => `\`${k}\``).join(", ")}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

const detectionOptions = {
  enabled: createBooleanOption({
    description: "Enable or disable automatic detection",
    required: true,
  }),
};

@HelpDoc({
  command: "rep detection",
  category: HelpCategory.Moderation,
  description: "Configure automatic reputation detection settings",
  usage: "/rep detection [enabled]",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "detection",
  description: "Configure automatic reputation detection",
})
@Options(detectionOptions)
@Guard({
  guildOnly: true,
  feature: Features.Reputation,
  permissions: ["ManageGuild"],
})
@Middlewares(["guard"])
export class RepConfigDetectionCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof detectionOptions>) {
    const guildId = ctx.guildId;

    const { enabled } = ctx.options;
    await setFeatureFlag(guildId, Features.ReputationDetection, enabled);

    await ctx.write({
      content: `Automatic reputation detection has been **${enabled ? "enabled" : "disabled"}**.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
