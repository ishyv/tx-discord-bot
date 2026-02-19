/**
 * Autorole Help Command.
 *
 * Purpose: Provide contextual help for admins tweaking autorole rules.
 */
/**
 * Provides contextual help for admins tweaking autorole rules.
 * Keeping it as a command avoids relying on external docs while we iterate.
 */

import { Declare, Embed, SubCommand, type GuildCommandContext } from "seyfert";
import { UIColors } from "@/modules/ui/design-system";
import { HelpDoc, HelpCategory } from "@/modules/help";

import { requireAutoroleContext } from "./shared";

@HelpDoc({
  command: "autorole help",
  category: HelpCategory.Moderation,
  description: "Show contextual help and available options for auto-role rule configuration",
  usage: "/autorole help",
})
@Declare({
  name: "help",
  description: "Show available options for auto-role rules",
})
export default class AutoroleHelpCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const context = await requireAutoroleContext(ctx);
    if (!context) return;

    const embed = new Embed()
      .setColor(UIColors.info)
      .setTitle("Auto-role - Available Triggers")
      .setDescription(
        [
          "When creating a rule, you must use one of the following exact triggers:",
          "",
          "**`onMessageReactAny`**",
          "- Grants the role to anyone who reacts on any message in the server.",
          "- Use it with `duration` when possible to avoid accumulating permanent roles.",
          "",
          "**`onReactSpecific <messageId> <emoji>`**",
          "- Grants the role to anyone who reacts with the specified emoji on the specified message.",
          "- Use IDs copied in developer mode and emojis in `:name:` or `<:name:id>` format.",
          "- Permanent rules revoke the role when the reaction is removed or the message is deleted.",
          "",
          "**`onAuthorReactionThreshold <emoji> <count>`**",
          "- Grants the role to the message author when the emoji reaches the requested threshold.",
          "- Example: `onAuthorReactionThreshold :thumbsup: 10` assigns the role to the author when it reaches 10 reactions.",
          "- The role is removed if the count falls below the threshold.",
          "",
          "**`onReputationAtLeast <rep>`**",
          "- Grants the role when the user reaches the specified reputation score.",
          "- Example: `onReputationAtLeast 40` grants the role starting from 40 rep and revokes it if it falls below that value.",
          "- Configure a role for each reputation range you need.",
          "",
          "**`onAntiquityAtLeast <duration>`**",
          "- Grants the role to members who have been on the server for at least the specified duration.",
          "- Example: `onAntiquityAtLeast 30d` assigns the role to members with 30 days or more in the server.",
          "- Valid durations: `<number>m|h|d|w` (minutes, hours, days, weeks).",
          "",
          "You can add `duration` (for example `30m`, `1h`, `2d`, `1w`) to make the grant temporary. Without duration, the rule will be live and depend solely on the trigger.",
        ].join("\n"),
      );

    await ctx.write({ embeds: [embed] });
  }
}
