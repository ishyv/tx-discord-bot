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
  Options,
} from "seyfert";
import { UIColors } from "@/modules/ui/design-system";
import { HelpDoc, HelpCategory } from "@/modules/help";
import {
  RESTRICTED_FORUMS_ROLE_ID,
  RESTRICTED_JOBS_ROLE_ID,
  RESTRICTED_VOICE_ROLE_ID,
} from "@/constants/guild";
import { executeSanction } from "@/modules/moderation/executeSanction";

const TYPE_TRANSLATIONS: Record<string, string> = {
  forums: "Forums",
  voice: "Voice",
  jobs: "Jobs",
  all: "All",
};

const RESTRICTION_ROLES: Record<string, string[]> = {
  jobs: [RESTRICTED_JOBS_ROLE_ID],
  forums: [RESTRICTED_FORUMS_ROLE_ID],
  voice: [RESTRICTED_VOICE_ROLE_ID],
  all: [RESTRICTED_JOBS_ROLE_ID, RESTRICTED_FORUMS_ROLE_ID, RESTRICTED_VOICE_ROLE_ID],
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

@HelpDoc({
  command: "restrict",
  category: HelpCategory.Moderation,
  description: "Restrict a user from forums, voice, or jobs channels",
  usage: "/restrict <user> <type> [reason]",
  examples: ["/restrict @User forums", "/restrict @User all"],
  permissions: ["MuteMembers"],
})
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
    const roleIds = RESTRICTION_ROLES[type] ?? [];

    await executeSanction({
      ctx,
      targetUser: user,
      reason,
      caseType: "RESTRICT",
      execute: (member) =>
        Promise.all(roleIds.map((roleId) => member.roles.add(roleId))).then(
          () => {},
        ),
      successTitle: "User restricted",
      extraSuccessLines: [`**Restriction:** ${TYPE_TRANSLATIONS[type]}`],
      logTitle: "User restricted",
      logColor: UIColors.warning,
      extraLogFields: [
        { name: "Restriction", value: TYPE_TRANSLATIONS[type], inline: false },
      ],
    });
  }
}
