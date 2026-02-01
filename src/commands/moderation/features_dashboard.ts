/**
 * Feature Dashboard Command
 */
import type { GuildCommandContext } from "seyfert";
import {
  Command,
  createBooleanOption,
  createStringOption,
  Declare,
  Embed,
  Options,
  Middlewares,
} from "seyfert";
import { UIColors } from "@/modules/ui/design-system";

import {
  getFeatureFlags,
  GUILD_FEATURES,
  setFeatureFlag,
  setAllFeatureFlags,
} from "@/modules/features";
import { AutoroleService, refreshGuildRules } from "@/modules/autorole";
import { Guard } from "@/middlewares/guards/decorator";

const featureChoices = GUILD_FEATURES.map((feature) => ({
  name: feature,
  value: feature,
}));

const options = {
  feature: createStringOption({
    description: "Feature to enable/disable",
    required: false,
    choices: featureChoices,
  }),
  enabled: createBooleanOption({
    description: "true = enable, false = disable",
    required: false,
  }),
  enable_all: createBooleanOption({
    description: "Enable all features",
    required: false,
  }),
  disable_all: createBooleanOption({
    description: "Disable all features",
    required: false,
  }),
};

@Declare({
  name: "features",
  description: "Enable or disable main bot features",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageGuild"],
})
@Options(options)
@Guard({
  guildOnly: true,
})
@Middlewares(["guard"])
export default class FeatureDashboardCommand extends Command {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;

    const feature = ctx.options.feature;
    const enabledInput = ctx.options.enabled;
    const enableAll = ctx.options.enable_all === true;
    const disableAll = ctx.options.disable_all === true;

    if (enableAll && disableAll) {
      await ctx.write({
        content: "You cannot enable and disable everything at the same time.",
      });
      return;
    }

    if (enableAll || disableAll) {
      const value = enableAll && !disableAll;
      const updated = await setAllFeatureFlags(guildId, value);
      if (disableAll) {
        await this.applySideEffects(ctx, guildId, "autoroles", false);
      }

      const embed = new Embed({
        title: value
          ? "All features enabled"
          : "All features disabled",
        color: value ? UIColors.success : UIColors.error,
        fields: GUILD_FEATURES.map((f) => ({
          name: f,
          value: updated[f] ? "✅ Active" : "⛔ Inactive",
          inline: true,
        })),
      });
      await ctx.write({ embeds: [embed] });
      return;
    }

    if (!feature || enabledInput === undefined) {
      const features = await getFeatureFlags(guildId);
      const embed = new Embed({
        title: "Features Dashboard",
        color: UIColors.info,
        description:
          "Summary of the current state of each system. Use `/features feature:<name> enabled:<true|false>` to update.",
        fields: GUILD_FEATURES.map((f) => ({
          name: f,
          value: features[f] ? "✅ Active" : "⛔ Inactive",
          inline: true,
        })),
      });
      await ctx.write({ embeds: [embed] });
      return;
    }

    const updated = await setFeatureFlag(guildId, feature, enabledInput);
    await this.applySideEffects(ctx, guildId, feature, enabledInput);

    const embed = new Embed({
      title: "Feature updated",
      color: enabledInput ? UIColors.success : UIColors.error,
      description: `\`${feature}\` is now ${enabledInput ? "enabled" : "disabled"}.`,
      fields: GUILD_FEATURES.map((f) => ({
        name: f,
        value: updated[f] ? "✅ Active" : "⛔ Inactive",
        inline: true,
      })),
    });
    await ctx.write({ embeds: [embed] });
  }

  /**
   * Side-effects when toggling features:
   * - autoroles: disabling turns off all rules and refreshes cache.
   */
  private async applySideEffects(
    ctx: GuildCommandContext<typeof options>,
    guildId: string,
    feature: string,
    enabled: boolean,
  ) {
    if (feature !== "autoroles" || enabled) return;

    try {
      const rules = await refreshGuildRules(guildId);
      const enabledRules = rules.filter((rule) => rule.enabled);
      if (enabledRules.length === 0) return;

      for (const rule of enabledRules) {
        await AutoroleService.toggleRule(guildId, rule.name, false);
      }

      ctx.client.logger?.info?.(
        "[dashboard] autoroles disabled: rules turned off",
        {
          guildId,
          disabledRules: enabledRules.length,
        },
      );
    } catch (error) {
      ctx.client.logger?.error?.(
        "[dashboard] could not disable autorole rules",
        {
          guildId,
          error,
        },
      );
    }
  }
}
