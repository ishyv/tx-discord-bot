import {
  createStringOption,
  Declare,
  Options,
  SubCommand,
  type GuildCommandContext,
} from "seyfert";

import * as repo from "@/modules/repo";
import { purgeRule } from "@/modules/repo";
import { respondRuleAutocomplete, requireAutoroleContext } from "./shared";

const options = {
  name: createStringOption({
    description: "Nombre de la regla a purgar",
    required: true,
    autocomplete: respondRuleAutocomplete,
  }),
};

@Declare({
  name: "purge",
  description: "Revocar roles otorgados por una regla",
})
@Options(options)
export default class AutorolePurgeCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const context = await requireAutoroleContext(ctx);
    if (!context) return;

    const slug = ctx.options.name.trim().toLowerCase();
    const rule = await repo.autoRoleFetchRule(context.guildId, slug);
    if (!rule) {
      await ctx.write({ content: `No existe una regla llamada \`${slug}\`.` });
      return;
    }

    const result = await purgeRule(ctx.client, context.guildId, slug);

    await ctx.write({
      content:
        `Se eliminaron ${result.removedGrants} motivos activos.` +
        (result.roleRevocations > 0
          ? ` Se removieron ${result.roleRevocations} roles.` 
          : " Ningun rol debia ser removido."),
    });
  }
}
