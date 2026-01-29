/**
 * Profile Command (Phase 3).
 *
 * Purpose: Display comprehensive economy profile.
 * Features:
 * - Account status and metadata
 * - Balance summary
 * - Bank info
 * - Inventory summary
 * - Reputation
 * - Handles blocked/banned accounts gracefully
 */

import { Command, Declare, type CommandContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
  economyAccountRepo,
  createEconomyAccountService,
  buildProfileEmbed,
  buildAccessDeniedEmbed,
  buildAccountCreatedEmbed,
  buildErrorEmbed,
  EconomyError,
  DEFAULT_MAX_VISIBLE_CURRENCIES,
} from "@/modules/economy";

// Service instance
const economyService = createEconomyAccountService(economyAccountRepo);

@Declare({
  name: "profile",
  description: "Muestra tu perfil económico completo.",
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 5000,
  uses: { default: 1 },
})
export default class ProfileCommand extends Command {
  async run(ctx: CommandContext) {
    const userId = ctx.author.id;

    // Ensure account (for isNew check)
    const ensureResult = await economyService.ensureAccount(userId);
    if (ensureResult.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed("No pude cargar tu perfil.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { isNew } = ensureResult.unwrap();

    // Get full profile
    const result = await economyService.getProfileSummary(userId, {
      balanceOptions: {
        maxVisible: DEFAULT_MAX_VISIBLE_CURRENCIES,
        showZeroBalances: false,
      },
    });

    if (result.isErr()) {
      const error = result.error;
      if (error instanceof EconomyError) {
        if (error.code === "ACCOUNT_BLOCKED" || error.code === "ACCOUNT_BANNED") {
          await ctx.write({
            embeds: [buildAccessDeniedEmbed(error.code === "ACCOUNT_BANNED" ? "banned" : "blocked")],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      await ctx.write({
        embeds: [buildErrorEmbed("No pude cargar tu perfil.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const view = result.unwrap();
    const embed = buildProfileEmbed(view, ctx.author.username, ctx.author.avatarURL());

    // On first use, show creation notice
    if (isNew) {
      await ctx.write({
        embeds: [
          buildAccountCreatedEmbed(ctx.author.username),
          embed,
        ],
      });
      return;
    }

    await ctx.write({ embeds: [embed] });
  }
}
