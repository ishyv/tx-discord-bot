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
    description: "Nombre de la regla a deshabilitar",
    required: true,
    autocomplete: respondRuleAutocomplete,
  }),
};

@Declare({
  name: "disable",
  description: "Deshabilitar una regla de auto-role",
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
      await ctx.write({ content: `No existe una regla llamada \`${slug}\`.` });
      return;
    }
    if (!rule.enabled) {
      await ctx.write({ content: `La regla \`${slug}\` ya estaba deshabilitada.` });
      return;
    }

    const updated = await AutoroleService.toggleRule(context.guildId, slug, false);
    if (!updated) {
      await ctx.write({ content: "No se pudo deshabilitar la regla. Intenta nuevamente." });
      return;
    }

    await ctx.write({
      content: `Se deshabilito \`${slug}\`.\n${formatRuleSummary(updated)}`,
    });

    await logModerationAction(ctx.client, context.guildId, {
      title: "Autorole deshabilitado",
      description: formatRuleSummary(updated),
      actorId: ctx.author.id,
      fields: [{ name: "Regla", value: `\`${slug}\`` }],
    });
  }
}
