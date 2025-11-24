import {
  createNumberOption,
  createUserOption,
  Declare,
  GuildCommandContext,
  Options,
  SubCommand,
} from "seyfert";

import { adjustUserReputation } from "@/db/repositories";
import { syncUserReputationRoles } from "@/systems/autorole/service";
import {
  buildRepChangeMessage,
  normalizeRepAmount,
  requireRepContext,
} from "./shared";
import { logModerationAction } from "@/utils/moderationLogger";

const options = {
  user: createUserOption({
    description: "Usuario a remover reputacion",
    required: true,
  }),

  amount: createNumberOption({
    description: "Cantidad de reputacion a remover",
    required: true,
  }),
};

@Declare({
  name: "remove",
  description: "Remover reputacion a un usuario",
})
@Options(options)
export default class RepRemoveCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const context = await requireRepContext(ctx);
    if (!context) return;

    const amount = normalizeRepAmount(ctx.options.amount);
    if (amount == null) {
      await ctx.write({
        content: "La cantidad debe ser un numero entero mayor que 0.",
      });
      return;
    }

    const target = ctx.options.user;
    const total = await adjustUserReputation(target.id, -amount);
    await syncUserReputationRoles(
      ctx.client,
      context.guildId,
      target.id,
      total,
    );

    await ctx.write({
      content: buildRepChangeMessage("remove", amount, target.id, total),
    });

    await logModerationAction(ctx.client, context.guildId, {
      title: "Reputación removida",
      description: `Se removieron ${amount} puntos de <@${target.id}>`,
      fields: [
        { name: "Total", value: `${total}`, inline: true },
        { name: "Moderador", value: `<@${ctx.author.id}>`, inline: true },
      ],
      actorId: ctx.author.id,
    },
    "pointsLog");
  }
}
