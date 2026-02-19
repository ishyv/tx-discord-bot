/**
 * Autorole List Command
 */
import { Declare, Embed, SubCommand, type GuildCommandContext } from "seyfert";
import { UIColors } from "@/modules/ui/design-system";
import { HelpDoc, HelpCategory } from "@/modules/help";

import { refreshGuildRules } from "@/modules/autorole";

import {
  formatRuleMode,
  formatTrigger,
  requireAutoroleContext,
} from "./shared";

@HelpDoc({
  command: "autorole list",
  category: HelpCategory.Moderation,
  description: "List all configured auto-role rules and their current status",
  usage: "/autorole list",
  permissions: ["ManageRoles"],
})
@Declare({
  name: "list",
  description: "List the configured auto-role rules",
})
export default class AutoroleListCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const context = await requireAutoroleContext(ctx);
    if (!context) return;

    const rules = await refreshGuildRules(context.guildId);
    if (!rules.length) {
      await ctx.write({
        content: "No auto-role rules configured.",
      });
      return;
    }

    const fields = rules.map((rule) => {
      const roleLabel = `<@&${rule.roleId}>`;
      const trigger = formatTrigger(rule.trigger);
      const mode = formatRuleMode(rule);
      const state = rule.enabled ? "🟢" : "🔴";
      return {
        name: `${state} ${rule.name}`,
        value: `**Role:** ${roleLabel}\n**Trigger:** ${trigger}\n**Mode:** \`${mode}\``,
        inline: true,
      };
    });

    const embeds: Embed[] = [];
    const MAX_FIELDS = 25;
    for (let index = 0; index < fields.length; index += MAX_FIELDS) {
      const chunk = fields.slice(index, index + MAX_FIELDS);
      const page = Math.floor(index / MAX_FIELDS) + 1;
      const totalPages = Math.ceil(fields.length / MAX_FIELDS);

      const embed = new Embed({
        title: "Auto-role rules",
        color: UIColors.info,
      }).addFields(chunk);

      if (totalPages > 1) {
        embed.setFooter({ text: `Page ${page}/${totalPages}` });
      }

      embeds.push(embed);
    }

    await ctx.write({ embeds });
  }
}
