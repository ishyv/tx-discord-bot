import { Command, Declare, type CommandContext } from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import { ensureUser } from "@/db/repositories/users";
import { BindDisabled, Features } from "@/modules/features";
import { buildBalanceFields, toBalanceLike } from "./shared";

@Declare({
  name: "balance",
  description: "Muestra tu balance: mano, banco, total y reputación.",
})
@BindDisabled(Features.Economy)
export default class BalanceCommand extends Command {
  async run(ctx: CommandContext) {
    const userResult = await ensureUser(ctx.author.id);
    if (userResult.isErr()) {
      await ctx.write({
        embeds: [{
          color: EmbedColors.Red,
          description: "No pude cargar tus datos de economía.",
        }],
      });
      return;
    }
    const user = userResult.unwrap();

    const fields = buildBalanceFields(toBalanceLike(user));

    await ctx.write({
      embeds: [
        {
          color: EmbedColors.Blue,
          author: {
            name: ctx.author.username,
            icon_url: ctx.author.avatarURL(),
          },
          title: "Tu balance",
          fields,
        },
      ],
    });
  }
}
