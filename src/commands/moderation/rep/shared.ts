import type { GuildCommandContext } from "seyfert";

import {
  GUILD_ONLY_MESSAGE,
  requireGuildPermission,
} from "@/utils/commandGuards";
import { assertFeatureEnabled } from "@/modules/features";

export interface RepCommandContext {
  guildId: string;
}

export async function requireRepContext(
  ctx: GuildCommandContext,
): Promise<RepCommandContext | null> {
  if (!ctx.guildId) {
    await ctx.write({ content: GUILD_ONLY_MESSAGE });
    return null;
  }

  const allowed = await requireGuildPermission(ctx, {
    guildId: ctx.guildId,
    permissions: ["ManageGuild"],
  });

  if (!allowed) {
    return null;
  }

  const enabled = await assertFeatureEnabled(
    ctx as any,
    "reputation",
    "El sistema de reputacion está deshabilitado en este servidor.",
  );
  if (!enabled) return null;

  return { guildId: ctx.guildId };
}

const MAX_DELTA = 1_000_000;

export function normalizeRepAmount(
  input: number | null | undefined,
): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) return null;
  const value = Math.trunc(input);
  if (value <= 0) return null;
  return Math.min(value, MAX_DELTA);
}

type RepChangeAction = "add" | "remove";

export function buildRepChangeMessage(
  action: RepChangeAction,
  amount: number,
  userId: string,
  total: number,
): string {
  const emoji = action === "add" ? "📈" : "📉";
  const verb = action === "add" ? "agregaron" : "removieron";
  return `${emoji} Se ${verb} ${amount} punto(s) de reputacion a <@${userId}>. Total actual: **${total}**.`;
}
