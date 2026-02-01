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
import { UIColors } from "@/modules/ui/design-system";
import { BindDisabled, Features } from "@/modules/features";
import { parseAmountOrReply, replyMissingUser } from "./shared";
import { currencyTransaction } from "@/modules/economy";

const options = {
  amount: createStringOption({
    description: "Amount of coins to deposit (e.g. 100, all, 50%)",
    required: true,
  }),
};

@Declare({
  name: "deposit",
  description: "Deposit coins from your hand to the bank",
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
          "You don't have enough coins in hand to deposit that amount.",
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
        content: "An error occurred while processing the deposit.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const updated_coins = result.unwrap().coins!;
    await ctx.write({
      embeds: [
        {
          color: UIColors.success,
          description: `✅ You have deposited **${amount}** coins.\n\n💳 **Bank:** ${updated_coins.bank}\n🖐️ **Hand:** ${updated_coins.hand}`,
        },
      ],
    });
  }
}
