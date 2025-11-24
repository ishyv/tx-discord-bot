import {
  createStringOption,
  Declare,
  Options,
  SubCommand,
  type GuildCommandContext,
} from "seyfert";

import * as repo from "@/db/repositories";
import { disableRule } from "@/db/repositories";
import {
  formatRuleSummary,
  respondRuleAutocomplete,
  requireAutoroleContext,
} from "./shared";

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
    const rule = await repo.autoRoleFetchRule(context.guildId, slug);
    if (!rule) {
      await ctx.write({ content: `No existe una regla llamada \`${slug}\`.` });
      return;
    }
    if (!rule.enabled) {
      await ctx.write({ content: `La regla \`${slug}\` ya estaba deshabilitada.` });
      return;
    }

    const updated = await disableRule(context.guildId, slug);
    if (!updated) {
      await ctx.write({ content: "No se pudo deshabilitar la regla. Intenta nuevamente." });
      return;
    }

    await ctx.write({
      content: `Se deshabilito \`${slug}\`.\n${formatRuleSummary(updated)}`,
    });
  }
}

