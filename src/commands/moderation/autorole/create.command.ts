/**
 * Autorole Create Command
 */
import {
  createRoleOption,
  createStringOption,
  Declare,
  Embed,
  Options,
  SubCommand,
  type GuildCommandContext,
} from "seyfert";
import { UIColors } from "@/modules/ui/design-system";
import { PermissionFlagsBits } from "seyfert/lib/types";

import {
  AutoroleService,
  isValidRuleSlug,
  normalizeRuleSlug,
  parseDuration as parseDurationInput,
  parseTrigger,
  refreshGuildRules,
} from "@/modules/autorole";
import type {
  AutoRoleRule,
  AutoRoleTrigger,
} from "@/modules/autorole/domain/types";
import { logModerationAction } from "@/utils/moderationLogger";

import {
  botCanManageRole,
  formatRuleSummary,
  requireAutoroleContext,
} from "./shared";

const options = {
  name: createStringOption({
    description: "Rule slug (lowercase, 1-40 characters)",
    required: true,
  }),
  trigger: createStringOption({
    description: "Trigger definition (e.g. `onReact <messageId> <:emoji:>`)",
    required: true,
  }),
  role: createRoleOption({
    description: "Role to grant when trigger is met",
    required: true,
  }),
  duration: createStringOption({
    description: "Duration (e.g. 30m, 1h, 2d). Empty = permanent",
    required: false,
  }),
};

const DANGEROUS_ROLE_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
] as const;

@Declare({
  name: "create",
  description: "Create a new auto-role rule",
})
@Options(options)
export default class AutoroleCreateCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const context = await requireAutoroleContext(ctx);
    if (!context) return;

    const existingRules = await refreshGuildRules(context.guildId);

    const rawSlug = ctx.options.name.trim();
    if (!isValidRuleSlug(rawSlug)) {
      await ctx.write({
        content:
          "The name must use `a-z`, `0-9` or hyphens, and be between 1 and 40 characters.",
      });
      return;
    }
    const slug = normalizeRuleSlug(rawSlug);

    const nameCollision = existingRules.find((rule) => rule.name === slug);
    if (nameCollision) {
      await ctx.write({
        content: `A rule named \`${slug}\` already exists on this server.`,
      });
      return;
    }

    const trigger = parseTrigger(ctx.options.trigger);
    if (!trigger) {
      await ctx.write({
        content: "Invalid trigger. Check the format and try again.",
      });
      return;
    }

    const roleId = ctx.options.role.id;
    if (ctx.options.role.permissions?.has?.([...DANGEROUS_ROLE_PERMISSIONS])) {
      await ctx.write({
        content:
          "You cannot create a rule that grants a role with administrative permissions (Administrator / ManageGuild / ManageRoles).",
      });
      return;
    }

    const invokerCanManage = await userCanManageTargetRole(
      ctx,
      context.guildId,
      roleId,
    );
    if (!invokerCanManage) {
      await ctx.write({
        content:
          "You cannot assign rules for a role equal to or higher than your current hierarchy.",
      });
      return;
    }

    const manageable = await botCanManageRole(ctx, roleId);
    if (!manageable) {
      await ctx.write({
        content:
          "I cannot manage that role. Make sure it is below the bot's role and that the bot has ManageRoles permission.",
      });
      return;
    }

    const rawDuration = ctx.options.duration?.trim();
    const durationMs = rawDuration ? parseDurationInput(rawDuration) : null;
    if (rawDuration && durationMs == null) {
      await ctx.write({
        content: "Duration must use formats like `30m`, `1h`, `2d`, `1w`.",
      });
      return;
    }

    const preflightError = await validateTriggerInput(
      ctx,
      context.guildId,
      trigger,
      existingRules,
    );
    if (preflightError) {
      await ctx.write({ content: preflightError });
      return;
    }

    const rule = await AutoroleService.createRule({
      guildId: context.guildId,
      name: slug,
      trigger,
      roleId,
      durationMs,
      enabled: true,
      createdBy: ctx.author.id,
    });

    if (rule.trigger.type === "ANTIQUITY_THRESHOLD" && rule.enabled) {
      // Apply role to existing members who meet the antiquity threshold
      // In a real implementation, this could be heavy, so it's done asynchronously
      ctx.client.members
        .list(context.guildId)
        .then(async (members) => {
          for (const member of members) {
            await AutoroleService.syncUserAntiquityRoles(
              ctx.client,
              context.guildId,
              {
                id: member.id,
                joinedAt: member.joinedAt,
              },
            );
          }
        })
        .catch((e) =>
          ctx.client.logger?.error?.(
            "[autorole] initial antiquity sync failed",
            e,
          ),
        );
    }

    const embed = new Embed({
      title: "Rule created",
      color: UIColors.success,
      description: formatRuleSummary(rule),
    });

    await ctx.write({ embeds: [embed] });

    await logModerationAction(ctx.client, context.guildId, {
      title: "Autorole created",
      description: formatRuleSummary(rule),
      fields: [
        { name: "Trigger", value: `\`${ctx.options.trigger}\`` },
        { name: "Role", value: `<@&${roleId}>`, inline: true },
      ],
      actorId: ctx.author.id,
    });
  }
}

async function validateTriggerInput(
  ctx: GuildCommandContext,
  guildId: string,
  trigger: AutoRoleTrigger,
  existingRules: AutoRoleRule[],
): Promise<string | null> {
  if (trigger.type === "REACT_SPECIFIC") {
    const { messageId, emojiKey } = trigger.args;

    const duplicate = existingRules.find(
      (rule) =>
        rule.trigger.type === "REACT_SPECIFIC" &&
        rule.trigger.args.messageId === messageId &&
        rule.trigger.args.emojiKey === emojiKey,
    );
    if (duplicate) {
      return `A rule named \`${duplicate.name}\` already uses that message and emoji.`;
    }

    const emojiError = await ensureEmojiIsUsable(ctx, guildId, emojiKey);
    if (emojiError) return emojiError;
  } else if (trigger.type === "REACTED_THRESHOLD") {
    const emojiError = await ensureEmojiIsUsable(
      ctx,
      guildId,
      trigger.args.emojiKey,
    );
    if (emojiError) return emojiError;
  } else if (trigger.type === "REPUTATION_THRESHOLD") {
    const duplicate = existingRules.find(
      (rule) =>
        rule.trigger.type === "REPUTATION_THRESHOLD" &&
        rule.trigger.args.minRep === trigger.args.minRep,
    );
    if (duplicate) {
      return `A rule named \`${duplicate.name}\` already exists for rep >= ${trigger.args.minRep}.`;
    }
  }

  return null;
}

async function ensureEmojiIsUsable(
  ctx: GuildCommandContext,
  guildId: string,
  emojiKey: string,
): Promise<string | null> {
  if (!isCustomEmojiKey(emojiKey)) return null;

  try {
    const guild = await ctx.client.guilds.fetch(guildId);
    const emojis = await guild.emojis.list(true);
    const found = emojis.some((emoji) => emoji.id === emojiKey);
    if (!found) {
      return "The specified emoji does not belong to this server or no longer exists.";
    }
  } catch (error) {
    ctx.client.logger?.warn?.("[autorole] could not validate emoji", {
      guildId,
      emojiKey,
      error,
    });
    return "Could not validate the specified emoji. Make sure the bot has permission to view server emojis.";
  }

  return null;
}

function isCustomEmojiKey(key: string): boolean {
  return /^\d{16,}$/.test(key);
}

async function userCanManageTargetRole(
  ctx: GuildCommandContext,
  guildId: string,
  roleId: string,
): Promise<boolean> {
  try {
    const guild = await ctx.client.guilds.fetch(guildId);
    const roles = await guild.roles.list(true);
    const target = roles.find((role) => role.id === roleId);
    if (!target) return false;

    const member = await guild.members
      .fetch(ctx.author.id, true)
      .catch(() => null);
    if (!member) return false;

    const highest = await member.roles.highest(true).catch(() => null);
    if (!highest) return false;

    return highest.position > target.position;
  } catch (error) {
    ctx.client.logger?.warn?.(
      "[autorole] could not validate user hierarchy",
      {
        guildId,
        roleId,
        error,
      },
    );
    return false;
  }
}
