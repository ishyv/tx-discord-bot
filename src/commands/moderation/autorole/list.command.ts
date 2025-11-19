/**
 * Lists the autorole rules configured for a guild.  The heavy lifting around
 * formatting lives in the shared helpers so this command stays presentation focused.
 */

import {
  Declare,
  Embed,
  SubCommand,
  type GuildCommandContext,
} from "seyfert";
import { EmbedColors } from "seyfert/lib/common";

import { refreshGuildRules } from "@/modules/repo";

import {
  formatRuleMode,
  formatTrigger,
  requireAutoroleContext,
} from "./shared";

@Declare({
  name: "list",
  description: "Listar las reglas de auto-role configuradas",
})
export default class AutoroleListCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const context = await requireAutoroleContext(ctx);
    if (!context) return;

    const rules = await refreshGuildRules(context.guildId);
    if (!rules.length) {
      await ctx.write({
        content: "No hay reglas de auto-role configuradas.",
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
        color: EmbedColors.Blue,
      }).addFields(chunk);

      if (totalPages > 1) {
        embed.setFooter({ text: `Pagina ${page}/${totalPages}` });
      }

      embeds.push(embed);
    }

    await ctx.write({ embeds });
  }
}
