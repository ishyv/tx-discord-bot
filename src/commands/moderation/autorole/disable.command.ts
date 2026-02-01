/**
 * Autorole Disable Command
 */
import {
  createStringOption,
  Declare,
  Options,
  SubCommand,
  type GuildCommandContext,
} from "seyfert";

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
    description: "Name of the rule to disable",
    required: true,
    autocomplete: respondRuleAutocomplete,
  }),
};

@Declare({
  name: "disable",
  description: "Disable an auto-role rule",
})
@Options(options)
export default class AutoroleDisableCommand extends SubCommand {
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
    if (!rule.enabled) {
      await ctx.write({
        content: `The rule \`${slug}\` was already disabled.`,
      });
      return;
    }

    const updated = await AutoroleService.toggleRule(
      context.guildId,
      slug,
      false,
    );
    if (!updated) {
      await ctx.write({
        content: "Could not disable the rule. Please try again.",
      });
      return;
    }

    await ctx.write({
      content: `Disabled \`${slug}\`.\n${formatRuleSummary(updated)}`,
    });

    await logModerationAction(ctx.client, context.guildId, {
      title: "Autorole disabled",
      description: formatRuleSummary(updated),
      actorId: ctx.author.id,
      fields: [{ name: "Rule", value: `\`${slug}\`` }],
    });
  }
}
