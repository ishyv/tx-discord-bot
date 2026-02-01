/**
 * Role Clear Limit Command.
 *
 * Purpose: Remove a usage limit from a managed role.
 */
import type { GuildCommandContext } from "seyfert";
import {
  createStringOption,
  Declare,
  Embed,
  Options,
  SubCommand,
} from "seyfert";
import { UIColors } from "@/modules/ui/design-system";

import {
  findManagedRole,
  formatLimitRecord,
  requireGuildContext,
  resolveActionInput,
} from "./shared";
import { clearRoleLimit } from "@/modules/guild-roles";

const options = {
  key: createStringOption({
    description: "Managed role key",
    required: true,
  }),
  action: createStringOption({
    description: "Moderation action whose limit you want to clear",
    required: true,
  }),
};

@Declare({
  name: "clear-limit",
  description: "Delete the limit of an action",
})
@Options(options)
export default class RoleClearLimitCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const context = await requireGuildContext(ctx);
    if (!context) return;

    const key = ctx.options.key.trim();
    if (!key) {
      const embed = new Embed({
        title: "Invalid key",
        description: "Indicate the managed role key you want to edit.",
        color: UIColors.error,
      });
      await ctx.write({ embeds: [embed] });
      return;
    }

    const rawAction = ctx.options.action.trim();
    const resolvedAction = resolveActionInput(rawAction);
    if ("error" in resolvedAction) {
      const embed = new Embed({
        title: "Invalid action",
        description: resolvedAction.error,
        color: UIColors.error,
      });
      await ctx.write({ embeds: [embed] });
      return;
    }
    const action = resolvedAction.action;

    const role = await findManagedRole(context.guildId, key);
    if (!role) {
      const embed = new Embed({
        title: "Role not found",
        description:
          "There is no registered configuration with that key. Check the name and try again.",
        color: UIColors.error,
      });
      await ctx.write({ embeds: [embed] });
      return;
    }

    const existing = role.limits[action.key];

    await clearRoleLimit(context.guildId, role.key, action.key);

    const updated = await findManagedRole(context.guildId, key);
    const remaining = updated ? Object.keys(updated.limits ?? {}).length : 0;

    const embed = new Embed({
      title:
        existing === undefined ? "Action not configured" : "Limit deleted",
      description:
        existing === undefined
          ? "There was no registered limit for that action."
          : `The action **${action.definition.label}** of the role **${key}** returns to default behavior.`,
      color: existing === undefined ? UIColors.warning : UIColors.warning,
      fields: [
        {
          name: "Remaining limits",
          value: remaining.toString(),
        },
        ...(existing
          ? [
            {
              name: "Previous limit",
              value: formatLimitRecord(existing),
            },
          ]
          : []),
      ],
    });

    await ctx.write({ embeds: [embed] });
  }
}
