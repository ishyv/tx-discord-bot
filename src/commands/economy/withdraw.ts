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
import { parseAmountOrReply, replyMissingUser, normalizeInt } from "./shared";
import { currencyTransaction } from "@/modules/economy";

const options = {
  amount: createStringOption({
    description: "Amount of coins to withdraw (e.g. 100, all, 50%)",
    required: true,
  }),
};

@Declare({
  name: "withdraw",
  description: "Withdraw coins from the bank to your hand",
})
@Options(options)
@Cooldown({
  type: CooldownType.User,
  interval: 5000,
  uses: { default: 1 },
})
@BindDisabled(Features.Economy)
export default class WithdrawCommand extends Command {
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

    const coins = user.currency.coins ?? {
      hand: 0,
      bank: 0,
      use_total_on_subtract: false,
    };
    const bank = normalizeInt(coins.bank);
    const amount = await parseAmountOrReply(ctx, rawAmount, bank);
    if (amount === null) return;

    if (amount > bank) {
      await ctx.write({
        content:
          "You don't have enough coins in the bank to withdraw that amount.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const result = await currencyTransaction(userId, {
      costs: [
        {
          currencyId: "coins",
          value: { hand: 0, bank: amount, use_total_on_subtract: false },
        },
      ],
      rewards: [
        {
          currencyId: "coins",
          value: { hand: amount, bank: 0, use_total_on_subtract: false },
        },
      ],
    });

    if (result.isErr()) {
      await ctx.write({
        content: "An error occurred while processing the withdrawal.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const updatedCoins = result.unwrap().coins ?? {
      hand: 0,
      bank: 0,
      use_total_on_subtract: false,
    };
    const updatedBank = normalizeInt(updatedCoins.bank);
    const updatedHand = normalizeInt(updatedCoins.hand);
    await ctx.write({
      embeds: [
        {
          color: UIColors.success,
          description: `✅ You have withdrawn **${amount}** coins.\n\n💳 **Bank:** ${updatedBank}\n🖐️ **Hand:** ${updatedHand}`,
        },
      ],
    });
  }
}
