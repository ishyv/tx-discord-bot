/**
 * Kick Command.
 *
 * Purpose: Register the "moderation/kick" command to offer the action consistently.
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
import { executeSanction } from "@/modules/moderation/executeSanction";

const options = {
  user: createUserOption({
    description: "User to kick",
    required: true,
  }),
  reason: createStringOption({
    description: "Reason for the kick",
    required: false,
  }),
};

@HelpDoc({
  command: "kick",
  category: HelpCategory.Moderation,
  description: "Kick a user from the server",
  usage: "/kick <user> [reason]",
  permissions: ["KickMembers"],
})
@Declare({
  name: "kick",
  description: "Kick a user from the server",
  defaultMemberPermissions: ["KickMembers"],
  botPermissions: ["KickMembers"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@Options(options)
export default class KickCommand extends Command {
  async run(ctx: GuildCommandContext<typeof options>) {
    const { user, reason = "No reason specified" } = ctx.options;
    const auditReason = `${reason} | Kicked by ${ctx.author.username}`;

    await executeSanction({
      ctx,
      targetUser: user,
      reason,
      caseType: "KICK",
      execute: (member) => member.kick(auditReason),
      successTitle: "User kicked",
      logTitle: "User kicked",
      logColor: UIColors.warning,
    });
  }
}
