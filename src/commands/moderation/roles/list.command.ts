/**
 * Role List Command.
 *
 * Purpose: List managed roles and their limits.
 */
import type { GuildCommandContext } from "seyfert";
import { Declare, Embed, SubCommand } from "seyfert";
import { UIColors } from "@/modules/ui/design-system";
import { HelpDoc, HelpCategory } from "@/modules/help";

import { GuildStore } from "@/db/repositories/guilds";
import { buildModerationSummary, fetchManagedRoles } from "./shared";

@HelpDoc({
  command: "roles list",
  category: HelpCategory.Moderation,
  description: "List all managed roles and their configured limits",
  usage: "/roles list",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "list",
  description: "List managed roles and their limits",
})
export default class RoleListCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        embeds: [
          new Embed({
            title: "Managed Roles",
            description:
              "This command can only be executed within a server.",
            color: UIColors.error,
          }),
        ],
      });
      return;
    }

    await GuildStore.ensure(guildId);

    const roles = await fetchManagedRoles(guildId);

    if (!roles.length) {
      const empty = new Embed({
        title: "Managed Roles",
        description: "No registered configurations found.",
        color: UIColors.info,
      });
      await ctx.write({ embeds: [empty] });
      return;
    }

    const fields = roles.map((role) => ({
      name: `${role.key} - ${role.label}`,
      value: [
        role.discordRoleId
          ? `Linked role: <@&${role.discordRoleId}>`
          : "Linked role: Unassigned",
        "",
        buildModerationSummary(role),
      ].join("\n"),
    }));

    const embed = new Embed({
      title: "Managed Roles",
      color: UIColors.info,
      fields,
    });

    await ctx.write({ embeds: [embed] });
  }
}
