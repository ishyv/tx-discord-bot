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

import {
  AutoroleService,
  AutoRoleRulesStore,
  autoroleKeys,
} from "@/modules/autorole";
import { formatRuleSummary, respondRuleAutocomplete, requireAutoroleContext } from "./shared";
import { logModerationAction } from "@/utils/moderationLogger";

const options = {
  name: createStringOption({
    description: "Nombre de la regla a habilitar",
    required: true,
    autocomplete: respondRuleAutocomplete,
  }),
};

@Declare({
  name: "enable",
  description: "Habilitar una regla de auto-role",
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
      await ctx.write({ content: `No existe una regla llamada \`${slug}\`.` });
      return;
    }
    if (rule.enabled) {
      await ctx.write({ content: `La regla \`${slug}\` ya estaba habilitada.` });
      return;
    }

    const updated = await AutoroleService.toggleRule(context.guildId, slug, true);
    if (!updated) {
      await ctx.write({ content: "No se pudo habilitar la regla. Intenta nuevamente." });
      return;
    }

    await ctx.write({
      content: `Se habilito \`${slug}\`.\n${formatRuleSummary(updated)}`,
    });

    await logModerationAction(ctx.client, context.guildId, {
      title: "Autorole habilitado",
      description: formatRuleSummary(updated),
      actorId: ctx.author.id,
      fields: [{ name: "Regla", value: `\`${slug}\`` }],
    });
  }
}
