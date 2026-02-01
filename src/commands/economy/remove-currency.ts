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
    description: "Moneda a retirar",
    required: true,
    choices,
  }),
  amount: createIntegerOption({
    description: "Cantidad a retirar",
    required: true,
    min_value: 1,
  }),
  target: createUserOption({
    description: "Usuario a quien se le retirará la moneda",
    required: true,
  }),
  reason: createStringOption({
    description: "Razón del retiro",
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

@Declare({
  name: "remove-currency",
  description: "Retirar moneda a un usuario (permite deuda)",
  defaultMemberPermissions: ["ManageGuild"],
})
@Options(options)
export default class RemoveCurrencyCommand extends Command {
  async run(ctx: CommandContext<typeof options>) {
    const { currency, amount, target, reason } = ctx.options;

    const currencyObj = currencyRegistry.get(currency);
    if (!currencyObj) {
      await ctx.write({
        content: "La moneda especificada no existe.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (currency === "rep") {
      const totalResult = await adjustUserReputation(target.id, -amount);
      if (totalResult.isErr()) {
        await ctx.write({
          content: "No se pudo actualizar la reputacion.",
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
        content: `Se han retirado **${currencyObj.display(amount as any)}** a ${target.toString()}. Saldo actual: ${currencyObj.display(newBalance as any)}.`,
      });

      const logger = new GuildLogger();
      await logger.init(ctx.client, ctx.guildId);
      await logger.generalLog({
        title: "Moneda retirada",
        description: `El staff ${ctx.author.toString()} ha retirado moneda a ${target.toString()}.`,
        fields: [
          { name: "Moneda", value: currency, inline: true },
          { name: "Cantidad", value: `${amount}`, inline: true },
          {
            name: "Nuevo Saldo",
            value: currencyObj.display(newBalance as any),
            inline: true,
          },
          { name: "Razon", value: reason ?? "No especificada", inline: false },
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
        content: "No se pudo actualizar el inventario de monedas.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const newBalance = result.unwrap()[currency] ?? currencyObj.zero();

    await ctx.write({
      content: `Se han retirado **${currencyObj.display(costValue as any)}** a ${target.toString()}. Saldo actual: ${currencyObj.display(newBalance as any)}.`,
    });

    const logger = new GuildLogger();
    await logger.init(ctx.client, ctx.guildId);
    await logger.generalLog({
      title: "Moneda retirada",
      description: `El staff ${ctx.author.toString()} ha retirado moneda a ${target.toString()}.`,
      fields: [
        { name: "Moneda", value: currency, inline: true },
        { name: "Cantidad", value: `${amount}`, inline: true },
        {
          name: "Nuevo Saldo",
          value: currencyObj.display(newBalance as any),
          inline: true,
        },
        { name: "Razón", value: reason ?? "No especificada", inline: false },
      ],
      color: "Red",
    });
  }
}
