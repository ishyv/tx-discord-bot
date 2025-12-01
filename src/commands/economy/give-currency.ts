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
import { applyTransaction, currencyRegistry } from "@/modules/economy/transactions";
import { ensureUser, updateUser } from "@/db/repositories/users";

const choices = currencyRegistry.list().map((currencyId) => {
  return { name: currencyId, value: currencyId };
});

const options = {
  currency: createStringOption({
    description: "Moneda a entregar",
    required: true,
    choices,
  }),
  amount: createIntegerOption({
    description: "Cantidad a entregar",
    required: true,
    min_value: 1,
  }),
  target: createUserOption({
    description: "Usuario que recibira la moneda",
    required: true,
  }),
};

function buildRewardValue(currencyId: string, amount: number) {
  if (currencyId === "coins") {
    return { hand: amount, bank: 0, use_total_on_subtract: false };
  }
  return amount;
}

@Declare({
  name: "give-currency",
  description: "Dar moneda a un usuario",
  defaultMemberPermissions: ["ManageGuild"],
})
@Options(options)
export default class GiveCurrencyCommand extends Command {
  async run(ctx: CommandContext<typeof options>) {
    const { currency, amount, target } = ctx.options;

    const currencyObj = currencyRegistry.get(currency);
    if (!currencyObj) {
      await ctx.write({
        content: "La moneda especificada no existe.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const userData = await ensureUser(target.id);
    const current = userData.currency ?? {};

    const rewardValue = buildRewardValue(currency, amount);
    const result = applyTransaction(current, {
      rewards: [
        {
          currencyId: currency,
          value: rewardValue as any,
        },
      ],
    });

    if (result.isErr()) {
      await ctx.write({
        content: "No se pudo actualizar el inventario de monedas.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const nextCurrency = result.unwrap();
    await updateUser(target.id, { currency: nextCurrency });

    const newBalance = nextCurrency[currency] ?? currencyObj.zero();
    await ctx.write({
      content: `Se han anadido **${currencyObj.display(rewardValue as any)}** a ${target.toString()}. Saldo actual: ${currencyObj.display(newBalance as any)}.`,
    });
  }
}
