/**
 * Autorole Purge Command
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
import { respondRuleAutocomplete, requireAutoroleContext } from "./shared";

const options = {
  name: createStringOption({
    description: "Name of the rule to purge",
    required: true,
    autocomplete: respondRuleAutocomplete,
  }),
};

@HelpDoc({
  command: "autorole purge",
  category: HelpCategory.Moderation,
  description: "Revoke all roles that were granted by a specific auto-role rule",
  usage: "/autorole purge <rule_id>",
  permissions: ["ManageRoles"],
})
@Declare({
  name: "purge",
  description: "Revoke roles granted by a rule",
})
@Options(options)
export default class AutorolePurgeCommand extends SubCommand {
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

    const result = await AutoroleService.purgeRule(
      ctx.client,
      context.guildId,
      slug,
    );

    await ctx.write({
      content:
        `Deleted ${result.removedGrants} active grants.` +
        (result.roleRevocations > 0
          ? ` Removed ${result.roleRevocations} roles.`
          : " No roles needed to be removed."),
    });
  }
}
