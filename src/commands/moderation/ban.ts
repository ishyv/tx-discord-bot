/**
 * Ban Command.
 *
 * Purpose: Register the "moderation/ban" command to offer the action consistently.
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
    description: "User to ban",
    required: true,
  }),
  reason: createStringOption({
    description: "Reason for the ban",
    required: true,
  }),
};

@HelpDoc({
  command: "ban",
  category: HelpCategory.Moderation,
  description: "Permanently ban a user from the server",
  usage: "/ban <user> <reason>",
  permissions: ["BanMembers"],
})
@Declare({
  name: "ban",
  description: "Ban a user from the server",
  defaultMemberPermissions: ["BanMembers"],
  botPermissions: ["BanMembers"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@Options(options)
export default class BanCommand extends Command {
  async run(ctx: GuildCommandContext<typeof options>) {
    const { user, reason } = ctx.options;
    const auditReason = `${reason} | Banned by ${ctx.author.username}`;

    await executeSanction({
      ctx,
      targetUser: user,
      reason,
      caseType: "BAN",
      execute: () => ctx.client.bans.create(ctx.guildId, user.id, {}, auditReason),
      successTitle: "User banned",
      logTitle: "User banned",
      logColor: UIColors.error,
    });
  }
}
