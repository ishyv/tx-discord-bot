/**
 * Balance Command (Refactored for Phase 3).
 *
 * Purpose: Display user balance with improved UX.
 * Changes:
 * - Uses EconomyAccountService for data fetching
 * - Shows "and X more" for multiple currencies
 * - Handles blocked/banned accounts gracefully
 * - Shows account creation notice on first use
 */

import { Command, Declare, type CommandContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
  economyAccountRepo,
  createEconomyAccountService,
  buildBalanceEmbed,
  buildAccessDeniedEmbed,
  buildAccountCreatedEmbed,
  buildErrorEmbed,
  EconomyError,
  DEFAULT_MAX_VISIBLE_CURRENCIES,
} from "@/modules/economy";

// Service instance
const economyService = createEconomyAccountService(economyAccountRepo);

@Declare({
  name: "balance",
  description: "Shows your balance of coins and reputation.",
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 3000, // 3 seconds - shorter for read-only
  uses: { default: 1 },
})
export default class BalanceCommand extends Command {
  async run(ctx: CommandContext) {
    const userId = ctx.author.id;

    // Ensure account exists (for isNew check)
    const ensureResult = await economyService.ensureAccount(userId);
    if (ensureResult.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed("Could not load your economy account.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { isNew } = ensureResult.unwrap();

    // Get balance view
    const result = await economyService.getBalanceView(userId, {
      maxVisible: DEFAULT_MAX_VISIBLE_CURRENCIES,
      showZeroBalances: false,
    });

    if (result.isErr()) {
      const error = result.error;

      // Handle specific error types
      if (error instanceof EconomyError) {
        if (
          error.code === "ACCOUNT_BLOCKED" ||
          error.code === "ACCOUNT_BANNED"
        ) {
          await ctx.write({
            embeds: [
              buildAccessDeniedEmbed(
                error.code === "ACCOUNT_BANNED" ? "banned" : "blocked",
              ),
            ],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      await ctx.write({
        embeds: [buildErrorEmbed("Could not load your balance.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const view = result.unwrap();
    const embed = buildBalanceEmbed(
      view,
      ctx.author.username,
      ctx.author.avatarURL(),
    );

    // On first use, show creation notice before balance
    if (isNew) {
      await ctx.write({
        embeds: [buildAccountCreatedEmbed(ctx.author.username), embed],
      });
      return;
    }

    await ctx.write({ embeds: [embed] });
  }
}
