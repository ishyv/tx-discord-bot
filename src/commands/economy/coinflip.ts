/**
 * Coinflip Command.
 *
 * Purpose: Bet on a coin flip with heads or tails.
 */
import {
  Command,
  Declare,
  Options,
  type GuildCommandContext,
  createStringOption,
  createIntegerOption,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
  minigameService,
  minigameRepo,
  type CoinSide,
} from "@/modules/economy/minigames";
import {
  economyAccountRepo,
  createEconomyAccountService,
  guildEconomyRepo,
  buildErrorEmbed,
} from "@/modules/economy";
import { currencyRegistry } from "@/modules/economy/transactions";
import { buildCoinflipEmbed } from "@/modules/economy/account/embeds";

const coinflipOptions = {
  amount: createIntegerOption({
    description: "Cantidad a apostar",
    required: true,
    min_value: 1,
  }),
  choice: createStringOption({
    description: "Cara o cruz",
    required: true,
    choices: [
      { name: "🪙 Cara", value: "heads" },
      { name: "📀 Cruz", value: "tails" },
    ],
  }),
};

@Declare({
  name: "coinflip",
  description: "Apuesta en un lanzamiento de moneda",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 5000,
  uses: { default: 1 },
})
@Options(coinflipOptions)
export default class CoinflipCommand extends Command {
  async run(ctx: GuildCommandContext<typeof coinflipOptions>) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;

    if (!guildId) {
      await ctx.write({
        embeds: [buildErrorEmbed("Este comando solo funciona en servidores.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check feature flag
    const guildConfigResult = await guildEconomyRepo.ensure(guildId);
    if (
      guildConfigResult.isOk() &&
      !guildConfigResult.unwrap().features.coinflip
    ) {
      await ctx.write({
        embeds: [
          buildErrorEmbed("Coinflip está deshabilitado en este servidor."),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const amount = ctx.options.amount;
    const choice = ctx.options.choice as CoinSide;

    // Validate amount
    if (amount < 1) {
      await ctx.write({
        embeds: [buildErrorEmbed("La apuesta debe ser al menos 1.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check account
    const accountService = createEconomyAccountService(economyAccountRepo);
    const ensureResult = await accountService.ensureAccount(userId);
    if (ensureResult.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed("No se pudo acceder a tu cuenta.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { account } = ensureResult.unwrap();
    if (account.status !== "ok") {
      await ctx.write({
        embeds: [buildErrorEmbed("Tu cuenta tiene restricciones.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get config for validation
    const configResult = await minigameRepo.getCoinflipConfig(guildId);
    let currencyId = "coin";
    if (configResult.isOk()) {
      const config = configResult.unwrap();
      currencyId = config.currencyId;
      if (amount > config.maxBet) {
        await ctx.write({
          embeds: [
            buildErrorEmbed(
              `Apuesta máxima: ${config.maxBet} ${config.currencyId}\n\n💡 Intenta con una apuesta menor.`,
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    // Execute coinflip
    const result = await minigameService.coinflip({
      guildId,
      userId,
      amount,
      choice,
    });

    if (result.isErr()) {
      const error = result.error;
      const messages: Record<string, string> = {
        INSUFFICIENT_FUNDS: "No tienes suficiente saldo.",
        BET_TOO_LOW: "Apuesta demasiado baja.",
        BET_TOO_HIGH: "Apuesta demasiado alta.",
        COOLDOWN_ACTIVE: "Espera antes de apostar de nuevo.",
        DAILY_LIMIT_REACHED: "Has alcanzado el límite diario de apuestas.",
        CONFIG_NOT_FOUND: "Coinflip no está disponible.",
        INVALID_CHOICE: "Elige cara o cruz.",
        FEATURE_DISABLED: "Coinflip está deshabilitado en este servidor.",
      };

      await ctx.editOrReply({
        embeds: [buildErrorEmbed(messages[error.code] ?? error.message)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const game = result.unwrap();
    const currencyObj = currencyRegistry.get(currencyId);
    const display = (n: number) =>
      currencyObj?.display(n as any) ?? `${n} ${currencyId}`;

    const embed = buildCoinflipEmbed({
      won: game.won,
      amount: game.amount,
      choice: game.choice === "heads" ? "🪙 Cara" : "📀 Cruz",
      outcome: game.outcome === "heads" ? "🪙 Cara" : "📀 Cruz",
      winnings: game.winnings,
      houseFee: game.houseFee,
      netProfit: game.netProfit,
      newBalance: game.newBalance,
      display,
      correlationId: game.correlationId,
    });

    await ctx.editOrReply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }
}
