/**
 * Rob Command.
 *
 * Purpose: Attempt to steal currency from another user.
 */
import {
  Command,
  Declare,
  Options,
  type GuildCommandContext,
  createUserOption,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { minigameService, minigameRepo } from "@/modules/economy/minigames";
import {
  economyAccountRepo,
  createEconomyAccountService,
  guildEconomyRepo,
  buildErrorEmbed,
} from "@/modules/economy";
import { currencyRegistry } from "@/modules/economy/transactions";
import {
  buildRobEmbed,
  buildEconomyWarningEmbed,
} from "@/modules/economy/account/embeds";

const robOptions = {
  target: createUserOption({
    description: "Usuario a robar",
    required: true,
  }),
};

@Declare({
  name: "rob",
  description: "Intenta robarle a otro usuario (cuidado: puede fallar)",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 10000,
  uses: { default: 1 },
})
@Options(robOptions)
export default class RobCommand extends Command {
  async run(ctx: GuildCommandContext<typeof robOptions>) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;
    const target = ctx.options.target;

    if (!guildId) {
      await ctx.write({
        embeds: [buildErrorEmbed("Este comando solo funciona en servidores.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check feature flag
    const guildConfigResult = await guildEconomyRepo.ensure(guildId);
    if (guildConfigResult.isOk() && !guildConfigResult.unwrap().features.rob) {
      await ctx.write({
        embeds: [buildErrorEmbed("Rob está deshabilitado en este servidor.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!target) {
      await ctx.write({
        embeds: [buildErrorEmbed("Usuario no encontrado.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const targetId = target.id;

    // Self-check
    if (userId === targetId) {
      await ctx.write({
        embeds: [buildErrorEmbed("No puedes robarte a ti mismo.")],
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

    // Get config for validation messages
    const configResult = await minigameRepo.getRobConfig(guildId);
    if (configResult.isOk()) {
      const config = configResult.unwrap();

      // Show warning about risks
      const warningEmbed = buildEconomyWarningEmbed({
        title: "Intento de Robo",
        message: `**Objetivo:** ${target.username}`,
        emoji: "⚠️",
        fields: [
          {
            name: "Riesgos",
            value:
              `• ${Math.round(config.failChance * 100)}% probabilidad de fallar\n` +
              `• Multa de hasta ${Math.round(config.failFinePct * 100)}% si fallas\n` +
              `• Cooldown de ${Math.ceil(config.pairCooldownSeconds / 60)}min por objetivo`,
            inline: false,
          },
        ],
      });

      await ctx.write({
        embeds: [warningEmbed],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Execute rob
    const result = await minigameService.rob({
      guildId,
      userId,
      targetId,
    });

    if (result.isErr()) {
      const error = result.error;
      const messages: Record<string, string> = {
        SELF_TARGET: "No puedes robarte a ti mismo.",
        TARGET_NOT_FOUND: "Usuario no encontrado.",
        TARGET_BLOCKED: "El objetivo tiene restricciones.",
        TARGET_BANNED: "El objetivo está baneado.",
        TARGET_TOO_POOR: "El objetivo es demasiado pobre.",
        TARGET_INACTIVE: "El objetivo no ha estado activo recientemente.",
        INSUFFICIENT_FUNDS: "No tienes suficiente saldo para intentar robar.",
        COOLDOWN_ACTIVE: "Espera antes de intentar robar de nuevo.",
        PAIR_COOLDOWN: "Debes esperar antes de robar al mismo objetivo.",
        DAILY_LIMIT_REACHED: "Has alcanzado el límite diario de robos.",
        CONFIG_NOT_FOUND: "Rob no está disponible.",
        UPDATE_FAILED: "Error al procesar el robo.",
        FEATURE_DISABLED: "Rob está deshabilitado en este servidor.",
      };

      await ctx.editOrReply({
        embeds: [buildErrorEmbed(messages[error.code] ?? error.message)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const game = result.unwrap();
    const currencyObj = currencyRegistry.get("coin");
    const display = (n: number) =>
      currencyObj?.display(n as any) ?? `${n} coins`;

    const embed = buildRobEmbed({
      success: game.success,
      targetId,
      amountStolen: game.amountStolen,
      fineAmount: game.fineAmount ?? 0,
      robberBalanceAfter: game.robberBalanceAfter,
      targetBalanceAfter: game.targetBalanceAfter,
      display,
      correlationId: game.correlationId,
    });

    await ctx.editOrReply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }
}
