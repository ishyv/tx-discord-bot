/**
 * Give Currency Command (Phase 2a - Hardened).
 *
 * Purpose: Mod-only currency adjustment with audit logging.
 * Security: currencyId sanitized, permissions centralized.
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
    description: "Moneda a ajustar",
    required: true,
    choices,
  }),
  amount: createIntegerOption({
    description: "Cantidad a ajustar (puede ser negativa)",
    required: true,
  }),
  target: createUserOption({
    description: "Usuario objetivo",
    required: true,
  }),
  reason: createStringOption({
    description: "Razón del ajuste",
    required: false,
  }),
};

@Declare({
  name: "give-currency",
  description: "Ajustar balance de moneda de un usuario (mod-only)",
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
        content: "⚠️ ID de moneda inválido. Solo se permiten letras, números, guiones y guiones bajos.",
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
        INSUFFICIENT_PERMISSIONS: "❌ No tienes permisos para realizar esta acción.",
        CURRENCY_NOT_FOUND: "La moneda especificada no existe.",
        TARGET_NOT_FOUND: "El usuario objetivo no existe.",
        TARGET_BLOCKED: "⛔ La cuenta del usuario tiene restricciones temporales.",
        TARGET_BANNED: "🚫 La cuenta del usuario tiene restricciones permanentes.",
        UPDATE_FAILED: "❌ No se pudo actualizar el balance. Intenta nuevamente.",
      };

      const message = errorMessages[error.code] ?? "❌ Ocurrió un error inesperado.";

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
        const repBalance = targetAccount.unwrap()!.status === "ok" ? adjustment.after : 0;
        await AutoroleService.syncUserReputationRoles(
          ctx.client,
          guildId,
          target.id,
          repBalance as number,
        );
      }
    }

    // Build response message
    const actionStr = amount >= 0 ? "añadido" : "removido";

    await ctx.write({
      content:
        `✅ Se ha ${actionStr} **${currencyObj.display(amount as any)}** a ${target.toString()}.\n` +
        `📊 Nuevo balance: ${currencyObj.display(adjustment.after as any)}`,
    });

    // Note: Audit logging is handled by the service layer
  }
}
