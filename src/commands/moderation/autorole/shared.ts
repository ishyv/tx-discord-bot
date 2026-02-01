/**
 * Autorole Shared Utilities.
 *
 * Shared helpers for autorole commands live here so each subcommand stays lean.
 * The goal is to centralise permission checks, formatting, and repo wiring in
 * one place, reducing subtle drift between command implementations.
 */

import type { AutocompleteInteraction, GuildCommandContext } from "seyfert";

import {
  AutoRoleRulesStore,
  type AutoRoleRule,
  type AutoRoleTrigger,
  isValidRuleSlug,
  normalizeRuleSlug,
} from "@/modules/autorole";
import {
  GUILD_ONLY_MESSAGE,
  requireGuildPermission,
} from "@/utils/commandGuards";

export interface AutoroleCommandContext {
  guildId: string;
}

/**
 * Validate that the command is running inside a guild and that the caller has
 * the ManageRoles permission. Replies with a standard message when not.
 */
export async function requireAutoroleContext(
  ctx: GuildCommandContext,
): Promise<AutoroleCommandContext | null> {
  if (!ctx.guildId) {
    await ctx.write({ content: GUILD_ONLY_MESSAGE });
    return null;
  }

  const allowed = await requireGuildPermission(ctx, {
    guildId: ctx.guildId,
    permissions: ["ManageRoles"],
  });

  if (!allowed) {
    return null;
  }

  return { guildId: ctx.guildId };
}

/**
 * Normalize a potential slug while enforcing the allowed character set.
 */
export function ensureValidSlug(slug: string): string | null {
  if (!isValidRuleSlug(slug)) {
    return null;
  }
  return normalizeRuleSlug(slug);
}

/**
 * Render a human readable version of a trigger for embeds and logs.
 */
export function formatTrigger(trigger: AutoRoleTrigger): string {
  switch (trigger.type) {
    case "MESSAGE_REACT_ANY":
      return "`onMessageReactAny`";
    case "REACT_SPECIFIC":
      return `\`onReactSpecific\` message=\`${trigger.args.messageId}\` emoji=${trigger.args.emojiKey}`;
    case "REACTED_THRESHOLD":
      return `\`onAuthorReactionThreshold\` emoji=${trigger.args.emojiKey} count=${trigger.args.count}`;
    case "REPUTATION_THRESHOLD":
      return `\`onReputationAtLeast\` rep>=${trigger.args.minRep}`;
    case "ANTIQUITY_THRESHOLD":
      return `\`onAntiquityAtLeast\` duration>=${formatDuration(trigger.args.durationMs)}`;
    case "MESSAGE_CONTAINS":
      return `\`onMessageContains\` ${trigger.args.keywords.join(", ")}`;
    default:
      return "`onUnknownTrigger`";
  }
}

/**
 * Return a descriptive label for the rule duration mode.
 */
export function formatRuleMode(rule: AutoRoleRule): string {
  return rule.durationMs == null
    ? "[permanent]"
    : `[temporary ${formatDuration(rule.durationMs)}]`;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const parts: string[] = [];
  const units: Array<[string, number]> = [
    ["d", 86_400_000],
    ["h", 3_600_000],
    ["m", 60_000],
    ["s", 1000],
  ];

  let remaining = ms;
  for (const [label, unit] of units) {
    if (remaining >= unit) {
      const value = Math.floor(remaining / unit);
      remaining %= unit;
      parts.push(`${value}${label}`);
    }
  }

  if (!parts.length) {
    return `${Math.ceil(ms / 1000)}s`;
  }
  return parts.join(" ");
}

/**
 * Condense all relevant rule information into a single-line summary.
 */
export function formatRuleSummary(rule: AutoRoleRule): string {
  const trigger = formatTrigger(rule.trigger);
  const mode = formatRuleMode(rule);
  const enabled = rule.enabled ? "[active]" : "[disabled]";
  return `${trigger} -> <@&${rule.roleId}> ${mode} ${enabled}`;
}

/**
 * Provide autocomplete suggestions for rule slugs on commands that receive a
 * `name` argument.
 */
export async function respondRuleAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.respond([]);
    return;
  }

  const input = interaction.getInput()?.toLowerCase() ?? "";
  const res = await AutoRoleRulesStore.find({ guildId });
  const names = res.isOk() ? res.unwrap().map((r) => r.name) : [];

  const filtered = input
    ? names.filter((name) => name.toLowerCase().includes(input))
    : names;

  const trimmed = filtered.slice(0, 20).map((name) => ({
    name,
    value: name,
  }));

  await interaction.respond(trimmed);
}

/**
 * Verify that the bot can manage the target role before attempting to use it.
 */
export async function botCanManageRole(
  ctx: GuildCommandContext,
  roleId: string,
): Promise<boolean> {
  if (!ctx.guildId) return false;
  const botId = ctx.client.me?.id;
  if (!botId) return false;

  try {
    const guild = await ctx.client.guilds.fetch(ctx.guildId);
    const roles = await guild.roles.list(true);
    const target = roles.find((role) => role.id === roleId);
    if (!target) return false;

    const botMember = await guild.members.fetch(botId, true);
    const highest = await botMember.roles.highest(true);
    if (!highest) return false;

    return highest.position > target.position;
  } catch (error) {
    ctx.client.logger?.error?.("[autorole] manageability check failed", {
      guildId: ctx.guildId,
      roleId,
      error,
    });
    return false;
  }
}
