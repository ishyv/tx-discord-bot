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
    description: "User to rob",
    required: true,
  }),
};

@Declare({
  name: "rob",
  description: "Attempt to steal from another user (risky!)",
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
        embeds: [buildErrorEmbed("This command only works in servers.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check feature flag
    const guildConfigResult = await guildEconomyRepo.ensure(guildId);
    if (guildConfigResult.isOk() && !guildConfigResult.unwrap().features.rob) {
      await ctx.write({
        embeds: [buildErrorEmbed("Rob is disabled in this server.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!target) {
      await ctx.write({
        embeds: [buildErrorEmbed("User not found.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const targetId = target.id;

    // Self-check
    if (userId === targetId) {
      await ctx.write({
        embeds: [buildErrorEmbed("You can't rob yourself.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check account
    const accountService = createEconomyAccountService(economyAccountRepo);
    const ensureResult = await accountService.ensureAccount(userId);
    if (ensureResult.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed("Could not access your account.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { account } = ensureResult.unwrap();
    if (account.status !== "ok") {
      await ctx.write({
        embeds: [buildErrorEmbed("Your account has restrictions.")],
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
        title: "Rob Attempt",
        message: `**Target:** ${target.username}`,
        emoji: "⚠️",
        fields: [
          {
            name: "Risks",
            value:
              `• ${Math.round(config.failChance * 100)}% chance of failure\n` +
              `• Fine up to ${Math.round(config.failFinePct * 100)}% if you fail\n` +
              `• ${Math.ceil(config.pairCooldownSeconds / 60)}min cooldown per target`,
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
        SELF_TARGET: "You can't rob yourself.",
        TARGET_NOT_FOUND: "User not found.",
        TARGET_BLOCKED: "The target has restrictions.",
        TARGET_BANNED: "The target is banned.",
        TARGET_TOO_POOR: "The target is too poor.",
        TARGET_INACTIVE: "The target hasn't been active recently.",
        INSUFFICIENT_FUNDS: "You don't have enough balance to attempt a rob.",
        COOLDOWN_ACTIVE: "Wait before attempting to rob again.",
        PAIR_COOLDOWN: "You must wait before robbing the same target.",
        DAILY_LIMIT_REACHED: "You've reached the daily rob limit.",
        CONFIG_NOT_FOUND: "Rob is not available.",
        UPDATE_FAILED: "Error processing the rob.",
        FEATURE_DISABLED: "Rob is disabled in this server.",
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
