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
import { normalizeRepAmount, buildRepChangeMessage } from "./shared";
import { Guard } from "@/middlewares/guards/decorator";
import { Features } from "@/modules/features";
import { HelpDoc, HelpCategory } from "@/modules/help";

const options = {
  user: createUserOption({
    description: "User to give reputation to",
    required: true,
  }),
  amount: createNumberOption({
    description: "Amount of reputation to give",
    required: true,
  }),
};

@HelpDoc({
  command: "rep add",
  category: HelpCategory.Moderation,
  description: "Give reputation points to a user",
  usage: "/rep add <user> <amount>",
})
@Declare({
  name: "add",
  description: "Give reputation to a user",
})
@Options(options)
@Guard({
  guildOnly: true,
  feature: Features.Reputation,
})
@Middlewares(["guard"])
export default class RepAddCommand extends SubCommand {
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
    const totalResult = await adjustUserReputation(target.id, amount);
    if (totalResult.isErr()) {
      await ctx.write({ content: "Could not update reputation." });
      return;
    }
    const total = totalResult.unwrap();
    await recordReputationChange(ctx.client, guildId, target.id, amount);
    await AutoroleService.syncUserReputationRoles(
      ctx.client,
      guildId,
      target.id,
      total,
    );

    await ctx.write({
      content: buildRepChangeMessage("add", amount, target.id, total),
    });

    try {
      const logger = await ctx.getGuildLogger();
      await logger.moderationLog({
        title: "Reputation added",
        description: `Added ${amount} points to <@${target.id}>`,
        fields: [
          { name: "Total", value: `${total}`, inline: true },
          { name: "Moderator", value: `<@${ctx.author.id}>`, inline: true },
        ],
        actorId: ctx.author.id,
      }, "pointsLog");
    } catch {
      ctx.client.logger?.warn?.("[rep add] channel log failed", { guildId });
    }
  }
}
