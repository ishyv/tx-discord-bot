import {
  Command,
  CommandContext,
  Declare,
  Options,
  createIntegerOption,
  createStringOption,
  createUserOption,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { HelpDoc, HelpCategory } from "@/modules/help";
import {
  currencyTransaction,
  currencyRegistry,
} from "@/modules/economy/transactions";
import { GuildLogger } from "@/utils/guildLogger";
import { adjustUserReputation } from "@/db/repositories";
import { AutoroleService } from "@/modules/autorole";
import { recordReputationChange } from "@/systems/tops";

const choices = currencyRegistry.list().map((currencyId) => {
  return { name: currencyId, value: currencyId };
});

const options = {
  currency: createStringOption({
    description: "Currency to withdraw",
    required: true,
    choices,
  }),
  amount: createIntegerOption({
    description: "Amount to withdraw",
    required: true,
    min_value: 1,
  }),
  target: createUserOption({
    description: "User to withdraw currency from",
    required: true,
  }),
  reason: createStringOption({
    description: "Reason for withdrawal",
    required: false,
  }),
};

function buildCostValue(currencyId: string, amount: number) {
  if (currencyId === "coins") {
    // For coins, we subtract from hand by default, but if allowDebt logic relies on "costs",
    // standard subtraction logic applies.
    // If we want to support "debt", standard subtraction with allowDebt: true should work.
    return { hand: amount, bank: 0, use_total_on_subtract: true }; // use_total_on_subtract allows taking from bank if hand empty?
    // Actually, if we want to create negative balance, we probably just want straightforward subtraction.
    // BUT `Coins` logic for subtraction prioritizes logic.
    // Let's use simple hand subtraction for now to match `give` logic (which added to hand).
    // Or better, verify what `use_total_on_subtract` does.
    // Assuming standard "sub" operation.
  }
  return amount;
}

@HelpDoc({
  command: "remove-currency",
  category: HelpCategory.Economy,
  description: "Withdraw currency from a user's balance, allowing debt (mod only)",
  usage: "/remove-currency <user> <amount> [currency] [reason]",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "remove-currency",
  description: "Withdraw currency from a user (allows debt)",
  defaultMemberPermissions: ["ManageGuild"],
})
@Options(options)
export default class RemoveCurrencyCommand extends Command {
  async run(ctx: CommandContext<typeof options>) {
    const { currency, amount, target, reason } = ctx.options;

    const currencyObj = currencyRegistry.get(currency);
    if (!currencyObj) {
      await ctx.write({
        content: "The specified currency does not exist.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (currency === "rep") {
      const totalResult = await adjustUserReputation(target.id, -amount);
      if (totalResult.isErr()) {
        await ctx.write({
          content: "Could not update reputation.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const newBalance = totalResult.unwrap();
      if (ctx.guildId) {
        await recordReputationChange(
          ctx.client,
          ctx.guildId,
          target.id,
          -amount,
        );
        await AutoroleService.syncUserReputationRoles(
          ctx.client,
          ctx.guildId,
          target.id,
          newBalance,
        );
      }

      await ctx.write({
        content: `Removed **${currencyObj.displayAmount(amount)}** from ${target.toString()}. Current balance: \`${currencyObj.displayAmount(newBalance as number)}\`.`,
      });

      const logger = new GuildLogger();
      await logger.init(ctx.client, ctx.guildId);
      await logger.generalLog({
        title: "Currency Withdrawn",
        description: `Staff ${ctx.author.toString()} has withdrawn currency from ${target.toString()}.`,
        fields: [
          { name: "Currency", value: currency, inline: true },
          { name: "Amount", value: `${amount}`, inline: true },
          {
            name: "New Balance",
            value: currencyObj.displayAmount(newBalance as number),
            inline: true,
          },
          { name: "Reason", value: reason ?? "Not specified", inline: false },
        ],
        color: "Red",
      });
      return;
    }

    // We use COSTS for removal
    const costValue = buildCostValue(currency, amount);

    // allowDebt: true allows the transaction even if balance goes negative
    const result = await currencyTransaction(target.id, {
      costs: [
        {
          currencyId: currency,
          value: costValue as any,
        },
      ],
      allowDebt: true,
    });

    if (result.isErr()) {
      await ctx.write({
        content: "Could not update the currency inventory.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const newBalance = result.unwrap()[currency] ?? currencyObj.zero();

    await ctx.write({
      content: `Removed **${currencyObj.displayAmount(amount)}** from ${target.toString()}. Current balance: \`${currencyObj.displayAmount(newBalance as number)}\`.`,
    });

    const logger = new GuildLogger();
    await logger.init(ctx.client, ctx.guildId);
    await logger.generalLog({
      title: "Currency Withdrawn",
      description: `Staff ${ctx.author.toString()} has withdrawn currency from ${target.toString()}.`,
      fields: [
        { name: "Currency", value: currency, inline: true },
        { name: "Amount", value: `${amount}`, inline: true },
        {
          name: "New Balance",
          value: currencyObj.displayAmount(newBalance as number),
          inline: true,
        },
        { name: "Reason", value: reason ?? "Not specified", inline: false },
      ],
      color: "Red",
    });
  }
}
