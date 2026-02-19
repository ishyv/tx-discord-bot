/**
 * Mute Command.
 *
 * Purpose: Register the "moderation/mute" command to offer the action consistently.
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
import { MessageFlags } from "seyfert/lib/types";
import { UIColors } from "@/modules/ui/design-system";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { parse, isValid } from "@/utils/ms";
import { executeSanction } from "@/modules/moderation/executeSanction";

const options = {
  user: createUserOption({
    description: "User to mute",
    required: true,
  }),
  time: createStringOption({
    description: "How long do you want the mute to last? (e.g. 10min)",
    required: true,
  }),
  reason: createStringOption({
    description: "Reason for the mute",
    required: false,
  }),
};

@HelpDoc({
  command: "mute",
  category: HelpCategory.Moderation,
  description: "Temporarily mute (timeout) a user for a specified duration",
  usage: "/mute <user> <time> [reason]",
  examples: ["/mute @User 10min Spamming"],
  permissions: ["MuteMembers"],
})
@Declare({
  name: "mute",
  description: "Mute a user (timeout)",
  defaultMemberPermissions: ["MuteMembers"],
  botPermissions: ["MuteMembers"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@Options(options)
export default class MuteCommand extends Command {
  async run(ctx: GuildCommandContext<typeof options>) {
    const { user, time, reason = "No reason specified" } = ctx.options;

    if (!isValid(time)) {
      await ctx.editOrReply({
        content:
          "Invalid time format.\nValid examples: `10min`, `1h`, `3d`, `2m`, `5s`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const milliseconds = parse(time) || 0;
    const auditReason = `${reason} | Muted by ${ctx.author.username}`;

    await executeSanction({
      ctx,
      targetUser: user,
      reason,
      caseType: "TIMEOUT",
      execute: (member) => member.timeout(milliseconds, auditReason),
      successTitle: "User muted",
      extraSuccessLines: [`**Duration:** ${time}`],
      logTitle: "User muted",
      logColor: UIColors.warning,
      extraLogFields: [{ name: "Duration", value: time, inline: true }],
    });
  }
}
