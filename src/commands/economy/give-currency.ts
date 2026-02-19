/**
 * Give Currency Command (Phase 2a - Hardened).
 *
 * Purpose: Mod-only currency adjustment with audit logging.
 * Security: currencyId sanitized, permissions centralized.
 */

import { HelpDoc, HelpCategory } from "@/modules/help";
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
import { currencyRegistry } from "@/modules/economy/transactions";
import { currencyMutationService } from "@/modules/economy/mutations";
import { createEconomyPermissionChecker } from "@/modules/economy/permissions";
import { economyAccountRepo } from "@/modules/economy/account";
import { AutoroleService } from "@/modules/autorole";
import { recordReputationChange } from "@/systems/tops";
import { sanitizeCurrencyId } from "@/modules/economy/mutations/validation";

const choices = currencyRegistry.list().map((currencyId) => {
  return { name: currencyId, value: currencyId };
});

const options = {
  currency: createStringOption({
    description: "Currency to adjust",
    required: true,
    choices,
  }),
  amount: createIntegerOption({
    description: "Amount to adjust (can be negative)",
    required: true,
  }),
  target: createUserOption({
    description: "Target user",
    required: true,
  }),
  reason: createStringOption({
    description: "Reason for adjustment",
    required: false,
  }),
};

@HelpDoc({
  command: "give-currency",
  category: HelpCategory.Economy,
  description: "Adjust a user's currency balance with audit logging (mod only)",
  usage: "/give-currency <user> <amount> [currency] [reason]",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "give-currency",
  description: "Adjust a user's currency balance (mod-only)",
  defaultMemberPermissions: ["ManageGuild"],
})
@Options(options)
export default class GiveCurrencyCommand extends Command {
  async run(ctx: CommandContext<typeof options>) {
    const { currency: rawCurrencyId, amount, target, reason } = ctx.options;
    const actorId = ctx.author.id;
    const guildId = ctx.guildId ?? undefined;

    // Security: Sanitize currency ID before any processing
    const currencyId = sanitizeCurrencyId(rawCurrencyId);
    if (!currencyId) {
      await ctx.write({
        content:
          "⚠️ Invalid currency ID. Only letters, numbers, hyphens, and underscores are allowed.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get currency object for display
    const currencyObj = currencyRegistry.get(currencyId);
    if (!currencyObj) {
      await ctx.write({
        content: "The specified currency does not exist.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Create permission checker using centralized system
    const perms = createEconomyPermissionChecker(ctx.member);
    const checkAdmin = perms.canAdjustCurrency;

    // Use the currency mutation service
    const result = await currencyMutationService.adjustCurrencyBalance(
      {
        actorId,
        targetId: target.id,
        guildId,
        currencyId,
        delta: amount,
        reason,
      },
      checkAdmin,
    );

    if (result.isErr()) {
      const error = result.error;

      // Map error codes to user-friendly messages
      const errorMessages: Record<string, string> = {
        INSUFFICIENT_PERMISSIONS:
          "❌ You don't have permission to perform this action.",
        CURRENCY_NOT_FOUND: "The specified currency does not exist.",
        TARGET_NOT_FOUND: "The target user does not exist.",
        TARGET_BLOCKED:
          "⛔ The user's account has temporary restrictions.",
        TARGET_BANNED:
          "🚫 The user's account has permanent restrictions.",
        UPDATE_FAILED:
          "❌ Could not update the balance. Please try again.",
      };

      const message =
        errorMessages[error.code] ?? "❌ An unexpected error occurred.";

      await ctx.write({
        content: message,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const adjustment = result.unwrap();

    // Special handling for reputation (existing behavior)
    if (currencyId === "rep" && guildId) {
      await recordReputationChange(ctx.client, guildId, target.id, amount);
      const targetAccount = await economyAccountRepo.findById(target.id);
      if (targetAccount.isOk() && targetAccount.unwrap()) {
        const repBalance =
          targetAccount.unwrap()!.status === "ok" ? adjustment.after : 0;
        await AutoroleService.syncUserReputationRoles(
          ctx.client,
          guildId,
          target.id,
          repBalance as number,
        );
      }
    }

    // Build response message
    const actionStr = amount >= 0 ? "added" : "removed";

    await ctx.write({
      content:
        `✅ Successfully ${actionStr} **${currencyObj.displayAmount(amount)}** to ${target.toString()}.\n` +
        `📊 New balance: \`${currencyObj.displayAmount(adjustment.after as number)}\``,
    });

    // Note: Audit logging is handled by the service layer
  }
}
