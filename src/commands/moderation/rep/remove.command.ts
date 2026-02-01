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
    description: "User to remove reputation from",
    required: true,
  }),
  amount: createNumberOption({
    description: "Amount of reputation to remove",
    required: true,
  }),
};

@Declare({
  name: "remove",
  description: "Remove reputation from a user",
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
        content: "The amount must be an integer greater than 0.",
      });
      return;
    }

    const target = ctx.options.user;
    const totalResult = await adjustUserReputation(target.id, -amount);
    if (totalResult.isErr()) {
      await ctx.write({ content: "Could not update reputation." });
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
        title: "Reputation removed",
        description: `Removed ${amount} points from <@${target.id}>`,
        fields: [
          { name: "Total", value: `${total}`, inline: true },
          { name: "Moderator", value: `<@${ctx.author.id}>`, inline: true },
        ],
        actorId: ctx.author.id,
      },
      "pointsLog",
    );
  }
}
