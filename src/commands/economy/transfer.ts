/**
 * Transfer Command (Phase 2d + 2b).
 *
 * Purpose: User-to-user currency transfer with tax and large transfer alerts.
 * Security: Validates both accounts, checks sufficient funds, atomic transfer.
 */

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
import { sanitizeCurrencyId } from "@/modules/economy/mutations/validation";
import { guildEconomyService } from "@/modules/economy/guild";
import { getGuildChannels } from "@/modules/guild-channels";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";

const choices = currencyRegistry.list().map((currencyId) => {
  return { name: currencyId, value: currencyId };
});

const options = {
  currency: createStringOption({
    description: "Currency to transfer",
    required: true,
    choices,
  }),
  amount: createIntegerOption({
    description: "Amount to transfer (must be positive)",
    required: true,
    min_value: 1,
  }),
  recipient: createUserOption({
    description: "Recipient user",
    required: true,
  }),
  reason: createStringOption({
    description: "Reason for transfer",
    required: false,
  }),
};

@Declare({
  name: "transfer",
  description: "Transfer currency to another user",
})
@Options(options)
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 5000,
  uses: { default: 1 },
})
export default class TransferCommand extends Command {
  async run(ctx: CommandContext<typeof options>) {
    const { currency: rawCurrencyId, amount, recipient, reason } = ctx.options;
    const senderId = ctx.author.id;
    const guildId = ctx.guildId ?? undefined;

    // Security: Sanitize currency ID
    const currencyId = sanitizeCurrencyId(rawCurrencyId);
    if (!currencyId) {
      await ctx.write({
        content: "⚠️ Invalid currency ID.",
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

    // Step 1: Apply tax if in a guild
    let transferAmount = amount;
    let taxAmount = 0;
    let taxRate = 0;

    if (guildId) {
      const taxResult = await guildEconomyService.applyTax(
        guildId,
        "transfer",
        amount,
        { depositToGuild: true, source: "transfer" },
      );

      if (taxResult.isOk()) {
        const tax = taxResult.unwrap();
        transferAmount = tax.net;
        taxAmount = tax.tax;
        taxRate = tax.rate;
      }
    }

    // Step 2: Check for large transfer alert (before executing)
    if (guildId) {
      const alertResult = await guildEconomyService.checkLargeTransfer(
        guildId,
        amount,
        currencyId,
        senderId,
        recipient.id,
      );

      if (alertResult.isOk() && alertResult.unwrap()) {
        const alert = alertResult.unwrap()!;
        // Log the alert (could also send to a log channel)
        console.log(`[LargeTransferAlert] ${alert.level}: ${alert.message}`);

        try {
          const channels = await getGuildChannels(guildId);
          const core = channels.core as Record<
            string,
            { channelId: string } | null
          >;
          const logChannelId = core?.generalLogs?.channelId;

          if (logChannelId) {
            const logChannel = await ctx.client.channels
              .fetch(logChannelId)
              .catch(() => null);

            if (logChannel?.isTextGuild()) {
              await logChannel.messages.write({
                content: alert.message,
                allowed_mentions: { parse: [] },
              });
            }
          }
        } catch {
          // Logging must never block transfers.
        }
      }
    }

    // Step 3: Execute transfer with net amount (after tax)
    const result = await currencyMutationService.transferCurrency({
      senderId,
      recipientId: recipient.id,
      guildId,
      currencyId,
      amount: transferAmount, // Use net amount after tax
      reason,
    });

    if (result.isErr()) {
      const error = result.error;

      const errorMessages: Record<string, string> = {
        CURRENCY_NOT_FOUND: "The specified currency does not exist.",
        INVALID_AMOUNT: "The amount must be a positive number.",
        SELF_TRANSFER: "You can't transfer to yourself.",
        ACTOR_BLOCKED: "⛔ Your account has temporary restrictions.",
        ACTOR_BANNED: "🚫 Your account has permanent restrictions.",
        TARGET_BLOCKED:
          "⛔ The recipient's account has temporary restrictions.",
        TARGET_BANNED:
          "🚫 The recipient's account has permanent restrictions.",
        INSUFFICIENT_FUNDS:
          "❌ You don't have enough funds for this transfer.",
        UPDATE_FAILED: "❌ Transfer failed. Please try again.",
      };

      const message =
        errorMessages[error.code] ?? "❌ An unexpected error occurred.";

      await ctx.write({
        content: message,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const transfer = result.unwrap();

    // Build success message
    let taxInfo = "";
    if (taxAmount > 0) {
      taxInfo = `\n📊 Tax (${(taxRate * 100).toFixed(0)}%): ${currencyObj.display(taxAmount as any)}`;
    }

    await ctx.write({
      content:
        `✅ You transferred **${currencyObj.display(transferAmount as any)}** to ${recipient.toString()}.${taxInfo}\n` +
        `📤 Your new balance: \`${currencyObj.display(transfer.senderAfter as any)}\``,
    });

    // Note: Recipient notification could be added here (DM or mention)
    // but for now we keep it simple
  }
}
