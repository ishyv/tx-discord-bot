/**
 * Economy Command Shared Utilities.
 *
 * Purpose: Common helpers for economy commands.
 * Note: Phase 3 moved formatting to @/modules/economy/account/formatting.
 *       This file is kept for backward compatibility with mutation commands.
 */

import type { CommandContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import type { CurrencyInventory } from "@/modules/economy/currency";
import { parseSmartAmount } from "@/utils/economy";

export const MISSING_PROFILE_MESSAGE = "No se encontró tu perfil de usuario.";
export const INVALID_AMOUNT_MESSAGE =
  "Cantidad inválida. Debes especificar un número positivo, 'all' o un porcentaje válido.";

type WritableContext = Pick<CommandContext, "write">;

export const normalizeInt = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
};

/**
 * @deprecated Use buildBalanceView() and buildBalanceEmbed() from @/modules/economy instead.
 * Kept for backward compatibility with mutation commands (deposit, withdraw).
 */
export function buildBalanceFields(
  currency_inventory: CurrencyInventory,
): { name: string; value: string; inline: boolean }[] {
  const coins_hand = normalizeInt((currency_inventory.coins as any)?.hand);
  const coins_bank = normalizeInt((currency_inventory.coins as any)?.bank);
  const coins_total = coins_hand + coins_bank;

  const rep = normalizeInt(currency_inventory.rep);

  return [
    { name: "🫴 Mano", value: `${coins_hand} coins`, inline: true },
    { name: "💳 Banco", value: `${coins_bank} coins`, inline: true },
    { name: "💰 Total", value: `${coins_total} coins`, inline: true },
    { name: "📈 Reputación", value: `${rep}`, inline: true },
  ];
}

export async function replyMissingUser(ctx: WritableContext) {
  await ctx.write({
    content: MISSING_PROFILE_MESSAGE,
    flags: MessageFlags.Ephemeral,
  });
}

export async function parseAmountOrReply(
  ctx: WritableContext,
  rawAmount: string,
  available: number,
): Promise<number | null> {
  const amount = parseSmartAmount(rawAmount, available);
  if (amount <= 0) {
    await ctx.write({
      content: INVALID_AMOUNT_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  return amount;
}
