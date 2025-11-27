import { Command, Declare, Options, createStringOption, type CommandContext } from "seyfert";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { depositCoins, getUser } from "@/db/repositories/users";
import { parseSmartAmount } from "@/utils/economy";
import { EmbedColors } from "seyfert/lib/common";

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
export default class DepositCommand extends Command {
  async run(ctx: CommandContext<typeof options>) {
    const { amount: rawAmount } = ctx.options;
    const userId = ctx.author.id;

    // 1. Get current user state to calculate smart amount
    const user = await getUser(userId);
    if (!user) {
      await ctx.write({
        content: "No se encontró tu perfil de usuario.",
        flags: 64,
      });
      return;
    }

    // 2. Parse amount
    const amount = parseSmartAmount(rawAmount, user.cash);

    if (amount <= 0) {
      await ctx.write({
        content: "Cantidad inválida. Debes especificar un número positivo, 'all' o un porcentaje válido.",
        flags: 64,
      });
      return;
    }

    // 3. Perform deposit
    const result = await depositCoins(userId, amount);

    if (result.isErr()) {
      const error = result.error;
      const message =
        error.message === "INSUFFICIENT_FUNDS"
          ? "No tienes suficientes coins en mano para depositar esa cantidad."
          : "Ocurrió un error al procesar el depósito.";

      await ctx.write({
        content: message,
        flags: error.message === "INSUFFICIENT_FUNDS" ? undefined : 64,
      });
      return;
    }

    const updatedUser = result.unwrap();
    await ctx.write({
      embeds: [
        {
          color: EmbedColors.Green,
          description: `✅ Has depositado **${amount}** coins.\n\n💳 **Banco:** ${updatedUser.bank}\n🖐️ **Mano:** ${updatedUser.cash}`,
        },
      ],
    });
  }
}
