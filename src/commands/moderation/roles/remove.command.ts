/**
 * Role Remove Command.
 *
 * Purpose: Remove a managed role configuration.
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

import { GuildRolesRepo } from "@/db/repositories/guild-roles";
import { requireGuildContext } from "./shared";

const options = {
  key: createStringOption({
    description: "Key of the managed role to remove",
    required: true,
  }),
};

@Declare({
  name: "remove",
  description: "Remove a managed role",
})
@Options(options)
export default class RoleRemoveCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const context = await requireGuildContext(ctx);
    if (!context) return;

    const key = ctx.options.key.trim();
    if (!key) {
      const embed = new Embed({
        title: "Invalid Key",
        description:
          "Provide a known key to remove the configuration.",
        color: UIColors.error,
      });
      await ctx.write({ embeds: [embed] });
      return;
    }

    const res = await GuildRolesRepo.remove(context.guildId, key);
    const removed = res.isOk();

    const embed = new Embed({
      title: removed ? "Role removed" : "Role not found",
      description: removed
        ? `Configuration **${key}** was removed.`
        : "No configuration existed with that key.",
      color: removed ? UIColors.error : UIColors.warning,
    });

    await ctx.write({ embeds: [embed] });
  }
}
