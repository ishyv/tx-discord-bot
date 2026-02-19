/**
 * Autorole Enable Command
 */
import {
  createStringOption,
  Declare,
  Options,
  SubCommand,
  type GuildCommandContext,
} from "seyfert";

import { HelpDoc, HelpCategory } from "@/modules/help";
import {
  AutoroleService,
  AutoRoleRulesStore,
  autoroleKeys,
} from "@/modules/autorole";
import {
  formatRuleSummary,
  respondRuleAutocomplete,
  requireAutoroleContext,
} from "./shared";
import { logModerationAction } from "@/utils/moderationLogger";

const options = {
  name: createStringOption({
    description: "Name of the rule to enable",
    required: true,
    autocomplete: respondRuleAutocomplete,
  }),
};

@HelpDoc({
  command: "autorole enable",
  category: HelpCategory.Moderation,
  description: "Enable a previously disabled auto-role rule",
  usage: "/autorole enable <rule_id>",
  permissions: ["ManageRoles"],
})
@Declare({
  name: "enable",
  description: "Enable an auto-role rule",
})
@Options(options)
export default class AutoroleEnableCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const context = await requireAutoroleContext(ctx);
    if (!context) return;

    const slug = ctx.options.name.trim().toLowerCase();
    const id = autoroleKeys.rule(context.guildId, slug);
    const res = await AutoRoleRulesStore.get(id);
    const rule = res.isOk() ? res.unwrap() : null;

    if (!rule) {
      await ctx.write({ content: `No rule found named \`${slug}\`.` });
      return;
    }
    if (rule.enabled) {
      await ctx.write({
        content: `The rule \`${slug}\` was already enabled.`,
      });
      return;
    }

    const updated = await AutoroleService.toggleRule(
      context.guildId,
      slug,
      true,
    );
    if (!updated) {
      await ctx.write({
        content: "Could not enable the rule. Please try again.",
      });
      return;
    }

    await ctx.write({
      content: `Enabled \`${slug}\`.\n${formatRuleSummary(updated)}`,
    });

    await logModerationAction(ctx.client, context.guildId, {
      title: "Autorole enabled",
      description: formatRuleSummary(updated),
      actorId: ctx.author.id,
      fields: [{ name: "Rule", value: `\`${slug}\`` }],
    });
  }
}
