import { Command, Declare, type CommandContext } from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import { ensureUser } from "@/db/repositories/users";
import { BindDisabled, Features } from "@/modules/features";

@Declare({
  name: "balance",
  description: "Muestra tu balance: mano, banco, total y reputación.",
})
@BindDisabled(Features.Economy)
export default class BalanceCommand extends Command {
  async run(ctx: CommandContext) {
    const user = await ensureUser(ctx.author.id);

    const cash = Math.max(0, Math.trunc(user.cash ?? 0));
    const bank = Math.max(0, Math.trunc(user.bank ?? 0));
    const rep = Math.max(0, Math.trunc(user.rep ?? 0));
    const total = cash + bank;
    const format = (value: number) => value.toLocaleString("es-ES");

    await ctx.write({
      embeds: [
        {
          color: EmbedColors.Blue,
          author: {
            name: ctx.author.username,
            icon_url: ctx.author.avatarURL(),
          },
          title: "Tu balance",
          fields: [
            { name: "🫴 Mano", value: `${format(cash)} coins`, inline: true },
            { name: "💳 Banco", value: `${format(bank)} coins`, inline: true },
            { name: "💰 Total", value: `${format(total)} coins`, inline: true },
            { name: "⭐ Reputación", value: `${format(rep)}`, inline: true },
          ],
        },
      ],
    });
  }
}
