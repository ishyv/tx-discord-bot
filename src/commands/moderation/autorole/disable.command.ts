/**
 * Motivación: registrar el comando "moderation / autorole / disable" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import {
  createStringOption,
  Declare,
  Options,
  SubCommand,
  type GuildCommandContext,
} from "seyfert";

import { AutoRoleRulesRepo, disableRule } from "@/db/repositories";
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
    const rule = await AutoRoleRulesRepo.fetchOne(context.guildId, slug);
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

    await logModerationAction(ctx.client, context.guildId, {
      title: "Autorole deshabilitado",
      description: formatRuleSummary(updated),
      actorId: ctx.author.id,
      fields: [{ name: "Regla", value: `\`${slug}\`` }],
    });
  }
}
