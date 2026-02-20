/**
 * Autorole Inspect Command
 */
import {
  createStringOption,
  Declare,
  Embed,
  Options,
  SubCommand,
  type GuildCommandContext,
} from "seyfert";
import { UIColors } from "@/modules/ui/design-system";
import { HelpDoc, HelpCategory } from "@/modules/help";

import {
  AutoRoleGrantsStore,
  AutoRoleRulesStore,
  autoroleKeys,
} from "@/modules/autorole";
import {
  formatRuleMode,
  formatTrigger,
  respondRuleAutocomplete,
  requireAutoroleContext,
} from "./shared";

const options = {
  name: createStringOption({
    description: "Name of the rule to inspect",
    required: true,
    autocomplete: respondRuleAutocomplete,
  }),
};

@HelpDoc({
  command: "autorole inspect",
  category: HelpCategory.Moderation,
  description: "Show detailed information about an auto-role rule including active grant count",
  usage: "/autorole inspect <rule_id>",
  permissions: ["ManageRoles"],
})
@Declare({
  name: "inspect",
  description: "Show detailed information about an auto-role rule",
})
@Options(options)
export default class AutoroleInspectCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const context = await requireAutoroleContext(ctx);
    if (!context) return;

    const slug = ctx.options.name.trim().toLowerCase();
    const id = autoroleKeys.rule(context.guildId, slug);
    const res = await AutoRoleRulesStore.get(id);
    const rule = res.isOk() ? res.unwrap() : null;

    if (!rule) {
      await ctx.write({ content: `No rule found named \`${slug}\`.` });
      return;
    }

    const grantsRes = await AutoRoleGrantsStore.find({
      guildId: context.guildId,
      ruleName: slug,
    });
    const grants = grantsRes.isOk() ? grantsRes.unwrap() : [];

    const liveCount = grants.filter((g) => g.type === "LIVE").length;
    const timedCount = grants.filter((g) => g.type === "TIMED").length;
    const expiredCount = grants.filter(
      (g) => g.type === "TIMED" && g.expiresAt && g.expiresAt <= new Date(),
    ).length;

    const nextExpiry =
      timedCount > 0
        ? grants
            .filter((g) => g.type === "TIMED" && g.expiresAt)
            .sort(
              (a, b) =>
                (a.expiresAt?.getTime() ?? 0) - (b.expiresAt?.getTime() ?? 0),
            )[0]?.expiresAt
        : null;

    const state = rule.enabled ? "🟢 Active" : "🔴 Disabled";

    const embed = new Embed()
      .setTitle(`Autorole Rule: ${rule.name}`)
      .setColor(rule.enabled ? UIColors.success : UIColors.neutral)
      .addFields([
        {
          name: "Status",
          value: state,
          inline: true,
        },
        {
          name: "Role",
          value: `<@&${rule.roleId}>`,
          inline: true,
        },
        {
          name: "Mode",
          value: `\`${formatRuleMode(rule)}\``,
          inline: true,
        },
        {
          name: "Trigger",
          value: formatTrigger(rule.trigger),
          inline: false,
        },
        {
          name: "Active Grants",
          value: [
            `**Live:** ${liveCount}`,
            `**Timed:** ${timedCount}`,
            expiredCount > 0 ? `**Pending expiry:** ${expiredCount}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          inline: true,
        },
        {
          name: "Timestamps",
          value: [
            `**Created:** <t:${Math.floor(rule.createdAt.getTime() / 1000)}:R>`,
            `**Updated:** <t:${Math.floor(rule.updatedAt.getTime() / 1000)}:R>`,
            nextExpiry
              ? `**Next expiry:** <t:${Math.floor(nextExpiry.getTime() / 1000)}:R>`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
          inline: true,
        },
      ]);

    if (rule.createdBy) {
      embed.setFooter({ text: `Created by ${rule.createdBy}` });
    }

    await ctx.write({ embeds: [embed] });
  }
}
