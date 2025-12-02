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
import { currencyTransaction, currencyRegistry } from "@/modules/economy/transactions";
import { GuildLogger } from "@/utils/guildLogger";


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

    const rewardValue = buildRewardValue(currency, amount);
    const result = await currencyTransaction(target.id, {
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

    const newBalance = result.value[currency] ?? currencyObj.zero();

    await ctx.write({
      content: `Se han anadido **${currencyObj.display(rewardValue as any)}** a ${target.toString()}. Saldo actual: ${currencyObj.display(newBalance as any)}.`,
    });

    const logger = new GuildLogger();
    await logger.init(ctx.client, ctx.guildId);
    await logger.generalLog({
      title: "Moneda entregada",
      description: `El staff ${ctx.author.toString()} ha entregado moneda a ${target.toString()}.`,
      fields: [
        { name: "Moneda", value: currency, inline: true },
        { name: "Cantidad", value: `${amount}`, inline: true },
        { name: "Nuevo Saldo", value: currencyObj.display(newBalance as any), inline: true },
      ],
      color: "Green",
    });
  }
}
