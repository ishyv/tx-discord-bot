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
