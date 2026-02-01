/**
 * Forums List Command.
 *
 * Purpose: List monitored forums for AI-powered automatic replies.
 */
import type { GuildCommandContext } from "seyfert";
import { Declare, Embed, SubCommand, Middlewares } from "seyfert";
import { UIColors } from "@/modules/ui/design-system";

import { configStore, ConfigurableModule } from "@/configuration";
import { Guard } from "@/middlewares/guards/decorator";

@Declare({
  name: "list",
  description: "List monitored forums",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
})
@Guard({
  guildOnly: true,
})
@Middlewares(["guard"])
export default class ForumsListCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const guildId = ctx.guildId;

    const { forumIds } = await configStore.get(
      guildId,
      ConfigurableModule.ForumAutoReply,
    );

    if (!forumIds.length) {
      await ctx.write({ content: "No monitored forums configured." });
      return;
    }

    const lines = forumIds.map((id: string) => `• <#${id}>`).join("\n");

    const embed = new Embed({
      title: "Monitored Forums",
      description: lines,
      color: UIColors.info,
      footer: { text: `Total: ${forumIds.length}` },
    });

    await ctx.write({ embeds: [embed] });
  }
}
