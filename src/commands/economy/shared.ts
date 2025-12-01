import type { CommandContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import type { CurrencyInventory } from "@/modules/economy/currency";
import type { CoinValue } from "@/modules/economy/currencies/coin";
import { parseSmartAmount } from "@/utils/economy";

const ECONOMY_LOCALE = "es-ES";
export const MISSING_PROFILE_MESSAGE = "No se encontró tu perfil de usuario.";
export const INVALID_AMOUNT_MESSAGE =
  "Cantidad inválida. Debes especificar un número positivo, 'all' o un porcentaje válido.";

type BalanceLike = {
  coins: CoinValue;
  rep: number;
};

type WritableContext = Pick<CommandContext, "write">;

const ZERO_COINS: CoinValue = { hand: 0, bank: 0, use_total_on_subtract: false };

export function readCoins(inv?: CurrencyInventory): CoinValue {
  const coins = (inv as any)?.coins ?? ZERO_COINS;
  const hand = Number.isFinite((coins as any).hand) ? Math.trunc((coins as any).hand) : 0;
  const bank = Number.isFinite((coins as any).bank) ? Math.trunc((coins as any).bank) : 0;
  return {
    hand: Math.max(0, hand),
    bank: Math.max(0, bank),
    use_total_on_subtract: false,
  };
}

export function toBalanceLike(user: { currency?: CurrencyInventory; rep?: number }): BalanceLike {
  return {
    coins: readCoins(user.currency),
    rep: Math.max(0, Math.trunc(user.rep ?? 0)),
  };
}

/**
 * Normaliza cantidades de usuario evitando negativos y decimales.
 */
export function normalizeBalances(balances: BalanceLike) {
  return {
    hand: Math.max(0, Math.trunc(balances.coins.hand ?? 0)),
    bank: Math.max(0, Math.trunc(balances.coins.bank ?? 0)),
    rep: Math.max(0, Math.trunc(balances.rep ?? 0)),
  };
}

export function formatCoins(amount: number): string {
  return Math.max(0, Math.trunc(amount ?? 0)).toLocaleString(ECONOMY_LOCALE);
}

export function buildBalanceFields(balances: BalanceLike) {
  const normalized = normalizeBalances(balances);
  const total = normalized.hand + normalized.bank;

  return [
    { name: "🫴 Mano", value: `${formatCoins(normalized.hand)} coins`, inline: true },
    { name: "💳 Banco", value: `${formatCoins(normalized.bank)} coins`, inline: true },
    { name: "💰 Total", value: `${formatCoins(total)} coins`, inline: true },
    { name: "📈 Reputación", value: `${formatCoins(normalized.rep)}`, inline: true },
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

