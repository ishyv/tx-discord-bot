/**
 * Restrict Command.
 *
 * Purpose: Register the "moderation/restrict" command to offer the action consistently.
 * Uses the Seyfert command framework with typed options.
 */
import type { GuildCommandContext } from "seyfert";
import {
  Command,
  createStringOption,
  createUserOption,
  Declare,
  Embed,
  InteractionGuildMember,
  Options,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { UIColors } from "@/modules/ui/design-system";
import {
  RESTRICTED_FORUMS_ROLE_ID,
  RESTRICTED_JOBS_ROLE_ID,
  RESTRICTED_VOICE_ROLE_ID,
} from "@/constants/guild";
import { isSnowflake } from "@/utils/snowflake";

const TYPE_TRANSLATIONS: Record<string, string> = {
  forums: "Forums",
  voice: "Voice",
  jobs: "Jobs",
  all: "All",
};

const options = {
  user: createUserOption({
    description: "User to restrict",
    required: true,
  }),
  type: createStringOption({
    description: "Restriction type",
    required: true,
    choices: [
      { name: "Forums", value: "forums" },
      { name: "Voice", value: "voice" },
      { name: "Jobs", value: "jobs" },
      { name: "All", value: "all" },
    ],
  }),
  reason: createStringOption({
    description: "Reason for the restriction",
    required: true,
  }),
};

@Declare({
  name: "restrict",
  description: "Restrict a user from forums and channels",
  defaultMemberPermissions: ["MuteMembers"],
  botPermissions: ["ManageRoles"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@Options(options)
export default class RestrictCommand extends Command {
  async run(ctx: GuildCommandContext<typeof options>) {
    const { user, reason, type } = ctx.options;

    const GuildLogger = await ctx.getGuildLogger();

    if (ctx.author.id === user.id)
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content: "❌ You cannot restrict yourself.",
      });

    const targetMember =
      user instanceof InteractionGuildMember ? user : undefined;

    if (!targetMember)
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content:
          "❌ Could not find the member to restrict in the server.",
      });

    if (!(await targetMember.moderatable()))
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content:
          "❌ You cannot restrict a user with a role equal to or higher than yours.",
      });

    if (!ctx.guildId || !isSnowflake(ctx.guildId) || !isSnowflake(user.id)) {
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content: "❌ Invalid IDs. Try again.",
      });
    }

    const roles: Record<string, string | string[]> = {
      jobs: RESTRICTED_JOBS_ROLE_ID,
      forums: RESTRICTED_FORUMS_ROLE_ID,
      voice: RESTRICTED_VOICE_ROLE_ID,
      all: [
        RESTRICTED_JOBS_ROLE_ID,
        RESTRICTED_FORUMS_ROLE_ID,
        RESTRICTED_VOICE_ROLE_ID,
      ],
    };

    const targetRoles = roles[type];
    const roleIds = Array.isArray(targetRoles) ? targetRoles : [targetRoles];
    const invalidRole = roleIds.find((roleId) => !isSnowflake(roleId));
    if (invalidRole) {
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content:
          "❌ Invalid restriction role configured. Contact staff.",
      });
    }

    if (Array.isArray(targetRoles)) {
      await Promise.all(
        targetRoles.map((roleId) => targetMember.roles.add(roleId)),
      );
    } else {
      await targetMember.roles.add(targetRoles);
    }

    const successEmbed = new Embed({
      title: "User restricted correctly",
      description: `
        The user **${ctx.options.user.username}** was successfully restricted.

        **Reason:** ${reason}
        **Restriction:** ${TYPE_TRANSLATIONS[type]}
      `,
      color: UIColors.success,
      footer: {
        text: `Restricted by ${ctx.author.username}`,
        icon_url: ctx.author.avatarURL() || undefined,
      },
    });

    await ctx.write({
      flags: MessageFlags.Ephemeral,
      embeds: [successEmbed],
    });

    await GuildLogger.banSanctionLog({
      title: "User restricted",
      color: UIColors.warning,
      thumbnail: await user.avatarURL(),
      fields: [
        {
          name: "User",
          value: `${user.username} (${user.id})`,
          inline: true,
        },
        { name: "Reason", value: reason, inline: false },
        { name: "Restriction", value: TYPE_TRANSLATIONS[type], inline: false },
      ],
      footer: {
        text: `${ctx.author.username} (${ctx.author.id})`,
        iconUrl: ctx.author.avatarURL(),
      },
    });
  }
}
