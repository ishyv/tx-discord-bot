import {
  createNumberOption,
  createUserOption,
  Declare,
  GuildCommandContext,
  Options,
  SubCommand,
  Middlewares,
} from "seyfert";
import { adjustUserReputation } from "@/db/repositories/users";
import { recordReputationChange } from "@/systems/tops";
import { AutoroleService } from "@/modules/autorole";
import { logModerationAction } from "@/utils/moderationLogger";
import { normalizeRepAmount, buildRepChangeMessage } from "./shared";
import { Guard } from "@/middlewares/guards/decorator";
import { Features } from "@/modules/features";

const options = {
  user: createUserOption({
    description: "Usuario al que quitar reputacion",
    required: true,
  }),
  amount: createNumberOption({
    description: "Cantidad de reputacion a quitar",
    required: true,
  }),
};

@Declare({
  name: "remove",
  description: "Remover reputacion a un usuario",
})
@Options(options)
@Guard({
  guildOnly: true,
  feature: Features.Reputation,
})
@Middlewares(["guard"])
export default class RepRemoveCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;

    const amount = normalizeRepAmount(ctx.options.amount);
    if (amount == null) {
      await ctx.write({
        content: "La cantidad debe ser un numero entero mayor que 0.",
      });
      return;
    }

    const target = ctx.options.user;
    const totalResult = await adjustUserReputation(target.id, -amount);
    if (totalResult.isErr()) {
      await ctx.write({ content: "No se pudo actualizar la reputación." });
      return;
    }
    const total = totalResult.unwrap();
    await recordReputationChange(ctx.client, guildId, target.id, -amount);
    await AutoroleService.syncUserReputationRoles(
      ctx.client,
      guildId,
      target.id,
      total,
    );

    await ctx.write({
      content: buildRepChangeMessage("remove", amount, target.id, total),
    });

    await logModerationAction(
      ctx.client,
      guildId,
      {
        title: "Reputación removida",
        description: `Se removieron ${amount} puntos de <@${target.id}>`,
        fields: [
          { name: "Total", value: `${total}`, inline: true },
          { name: "Moderador", value: `<@${ctx.author.id}>`, inline: true },
        ],
        actorId: ctx.author.id,
      },
      "pointsLog",
    );
  }
}
