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
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";

const choices = currencyRegistry.list().map((currencyId) => {
  return { name: currencyId, value: currencyId };
});

const options = {
  currency: createStringOption({
    description: "Moneda a transferir",
    required: true,
    choices,
  }),
  amount: createIntegerOption({
    description: "Cantidad a transferir (debe ser positiva)",
    required: true,
    min_value: 1,
  }),
  recipient: createUserOption({
    description: "Usuario destinatario",
    required: true,
  }),
  reason: createStringOption({
    description: "Razón de la transferencia",
    required: false,
  }),
};

@Declare({
  name: "transfer",
  description: "Transferir moneda a otro usuario",
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
        content: "⚠️ ID de moneda inválido.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get currency object for display
    const currencyObj = currencyRegistry.get(currencyId);
    if (!currencyObj) {
      await ctx.write({
        content: "La moneda especificada no existe.",
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

        // TODO: Send to configured log channel if available
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
        CURRENCY_NOT_FOUND: "La moneda especificada no existe.",
        INVALID_AMOUNT: "La cantidad debe ser un número positivo.",
        SELF_TRANSFER: "No puedes transferirte a ti mismo.",
        ACTOR_BLOCKED: "⛔ Tu cuenta tiene restricciones temporales.",
        ACTOR_BANNED: "🚫 Tu cuenta tiene restricciones permanentes.",
        TARGET_BLOCKED:
          "⛔ La cuenta del destinatario tiene restricciones temporales.",
        TARGET_BANNED:
          "🚫 La cuenta del destinatario tiene restricciones permanentes.",
        INSUFFICIENT_FUNDS:
          "❌ No tienes suficientes fondos para esta transferencia.",
        UPDATE_FAILED: "❌ Error en la transferencia. Intenta nuevamente.",
      };

      const message =
        errorMessages[error.code] ?? "❌ Ocurrió un error inesperado.";

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
      taxInfo = `\n📊 Impuesto (${(taxRate * 100).toFixed(0)}%): ${currencyObj.display(taxAmount as any)}`;
    }

    await ctx.write({
      content:
        `✅ Has transferido **${currencyObj.display(transferAmount as any)}** a ${recipient.toString()}.${taxInfo}\n` +
        `📤 Tu nuevo balance: ${currencyObj.display(transfer.senderAfter as any)}`,
    });

    // Note: Recipient notification could be added here (DM or mention)
    // but for now we keep it simple
  }
}
