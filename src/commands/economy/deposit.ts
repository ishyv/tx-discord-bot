import {
  Command,
  Declare,
  Options,
  createStringOption,
  type CommandContext,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { UserStore } from "@/db/repositories/users";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { EmbedColors } from "seyfert/lib/common";
import { BindDisabled, Features } from "@/modules/features";
import { parseAmountOrReply, replyMissingUser } from "./shared";
import { currencyTransaction } from "@/modules/economy";

const options = {
  amount: createStringOption({
    description: "Cantidad de coins a depositar (ej: 100, all, 50%)",
    required: true,
  }),
};

@Declare({
  name: "deposit",
  description: "Deposita coins de tu mano al banco",
})
@Options(options)
@Cooldown({
  type: CooldownType.User,
  interval: 5000,
  uses: { default: 1 },
})
@BindDisabled(Features.Economy)
export default class DepositCommand extends Command {
  async run(ctx: CommandContext<typeof options>) {
    const { amount: rawAmount } = ctx.options;
    const userId = ctx.author.id;

    const userResult = await UserStore.ensure(userId);
    if (userResult.isErr()) {
      await replyMissingUser(ctx);
      return;
    }
    const user = userResult.unwrap();
    if (!user) {
      await replyMissingUser(ctx);
      return;
    }

    const coins = user.currency.coins!;

    const amount = await parseAmountOrReply(ctx, rawAmount, coins.hand);
    if (amount === null) return;

    if (amount > coins.hand) {
      await ctx.write({
        content:
          "No tienes suficientes coins en mano para depositar esa cantidad.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const result = await currencyTransaction(userId, {
      costs: [
        {
          currencyId: "coins",
          value: { hand: amount, bank: 0, use_total_on_subtract: false },
        },
      ],
      rewards: [
        {
          currencyId: "coins",
          value: { hand: 0, bank: amount, use_total_on_subtract: false },
        },
      ],
    });

    if (result.isErr()) {
      await ctx.write({
        content: "Ocurrió un error al procesar el depósito.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const updated_coins = result.unwrap().coins!;
    await ctx.write({
      embeds: [
        {
          color: EmbedColors.Green,
          description: `✅ Has depositado **${amount}** coins.\n\n💳 **Banco:** ${updated_coins.bank}\n🖐️ **Mano:** ${updated_coins.hand}`,
        },
      ],
    });
  }
}
