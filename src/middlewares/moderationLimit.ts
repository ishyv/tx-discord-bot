/**
 * Purpose: Enforce per-role moderation limits and overrides before command execution.
 * Context: Global middleware that runs on guild commands.
 * Dependencies: guild-roles module, command guard helpers, Seyfert embeds.
 * Invariants:
 * - Only applies inside guilds (needs guild + member roles).
 * - `actionKey` must be stable or limits will not match.
 * Gotchas:
 * - Overrides are evaluated before consumption (denials short-circuit).
 * - stop() triggers onMiddlewaresError; commands with custom handlers must avoid double replies.
 * - Uses Date.now for user-facing timers (wall clock is OK for display only).
 */
import type { GuildCommandContext } from "seyfert";
import { Embed, createMiddleware } from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import {
  consumeRoleLimits,
  resolveRoleActionPermission,
  type RoleLimitBlock,
  type ResolveRoleActionPermissionResult,
} from "@/modules/guild-roles";
import {
  collectMemberRoleIds,
  memberHasDiscordPermission,
  extractGuildId,
} from "@/utils/commandGuards";

/**
 * Format seconds into a human-readable duration.
 *
 * Params:
 * - seconds: remaining time (may be fractional).
 *
 * Returns: string like "2h 5m" or "30s".
 */
function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const secs = total % 60;

  const parts: string[] = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!parts.length || secs) parts.push(`${secs}s`);
  return parts.join(" ");
}

/**
 * Build the embed for override-based denial (explicit allow/deny).
 *
 * WHY: Keeps a consistent UX for admin-configured overrides.
 */
function buildOverrideDeniedEmbed(
  actionKey: string,
  decision: ResolveRoleActionPermissionResult,
): Embed {
  const lines: string[] = [
    `La accion **${actionKey}** esta denegada por la configuracion del bot.`,
  ];

  if (decision.roleKey) {
    lines.push(
      `Override aplicado por la clave de rol \`${decision.roleKey}\`.`,
    );
  }

  return new Embed({
    title: "Accion bloqueada",
    color: EmbedColors.Red,
    description: lines.join("\n"),
  });
}

/**
 * Build the embed for rate-limit violations.
 *
 * Params:
 * - actionKey: normalized command key used for limit lookup.
 * - block: limit metadata returned by the guild-roles subsystem.
 */
function buildBlockEmbed(actionKey: string, block: RoleLimitBlock): Embed {
  const retrySeconds = Math.max(
    1,
    Math.ceil((block.resetAt - Date.now()) / 1_000),
  );
  const windowText = formatSeconds(block.windowSeconds);

  return new Embed({
    title: "Limite alcanzado",
    color: EmbedColors.Red,
    description: [
      `El rol configurado \`${block.roleKey}\` ya supero el cupo para **${actionKey}**.`,
      `Limite vigente: ${block.limit.limit} usos cada ${windowText}.`,
      `Podras intentarlo nuevamente en ${formatSeconds(retrySeconds)}.`,
    ].join("\n"),
  });
}

/**
 * Moderation limit middleware.
 *
 * Behavior:
 * - Resolves role overrides first (deny/allow).
 * - Consumes role-based limits if allowed.
 *
 * Side effects: Sends an embed response on denial or limit hit.
 */
export const moderationLimit = createMiddleware<void>(async (middle) => {
  const context = middle.context as GuildCommandContext;

  // WHY: Use unified guildId extraction for compatibility across contexts.
  const guildId = extractGuildId(context);
  if (!guildId) {
    return middle.next();
  }

  const actionKey = context.fullCommandName?.toLowerCase().trim();
  if (!actionKey) {
    return middle.next();
  }

  const roleIds = await collectMemberRoleIds(context.member ?? null);
  if (!roleIds.size) {
    return middle.next();
  }

  const hasDiscordPermission = await memberHasDiscordPermission(
    context.member ?? null,
    context.command.defaultMemberPermissions,
  );

  const overrideDecision = await resolveRoleActionPermission({
    guildId,
    actionKey,
    memberRoleIds: [...roleIds],
    hasDiscordPermission,
  });

  if (!overrideDecision.allowed) {
    const embed = buildOverrideDeniedEmbed(actionKey, overrideDecision);
    await context.write({ embeds: [embed] });
    return middle.stop("moderation-override-blocked");
  }

  const result = await consumeRoleLimits({
    guildId,
    actionKey,
    memberRoleIds: [...roleIds],
  });

  if (result.allowed) {
    return middle.next();
  }

  const embed = buildBlockEmbed(actionKey, result.violation);

  await context.write({ embeds: [embed] });

  return middle.stop("moderation-limit-blocked");
});
