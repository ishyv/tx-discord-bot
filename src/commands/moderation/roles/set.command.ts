/**
 * Role Set Command.
 *
 * Purpose: Register or update a managed role configuration.
 */
import type { GuildCommandContext } from "seyfert";
import {
  createRoleOption,
  createStringOption,
  Declare,
  Embed,
  Options,
  SubCommand,
} from "seyfert";
import { UIColors } from "@/modules/ui/design-system";

import { GuildStore } from "@/db/repositories/guilds";
import { GuildRolesRepo } from "@/db/repositories/guild-roles";

import { requireGuildContext } from "./shared";

const options = {
  key: createStringOption({
    description: "Internal identifier of the managed role",
    required: true,
  }),
  role: createRoleOption({
    description: "Discord role the configuration will apply to",
    required: true,
  }),
};

@Declare({
  name: "set",
  description: "Register or update a managed role",
})
@Options(options)
export default class RoleSetCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const context = await requireGuildContext(ctx);
    if (!context) return;

    const key = ctx.options.key.trim();
    const roleId = String(ctx.options.role.id);

    if (!key) {
      const embed = new Embed({
        title: "Invalid Key",
        description: "Provide a non-empty key to register the role.",
        color: UIColors.error,
      });
      await ctx.write({ embeds: [embed] });
      return;
    }

    await GuildStore.ensure(context.guildId);

    // Actualiza (o crea) el registro del rol administrado
    await GuildRolesRepo.update(context.guildId, key, {
      label: key,
      discordRoleId: roleId,
      updatedBy: ctx.author.id,
    });

    // Read back the role to show current state
    const rolesRes = await GuildRolesRepo.read(context.guildId);
    const role = rolesRes.isOk() ? (rolesRes.unwrap() as any)[key] : null;

    const embed = new Embed({
      title: "Managed role registered",
      color: UIColors.success,
      fields: [
        { name: "Key", value: key },
        {
          name: "Role",
          value: role?.discordRoleId
            ? `<@&${role.discordRoleId}>`
            : "Unassigned",
        },
        {
          name: "Configured Limits",
          value: String(
            Object.keys((role?.limits ?? {}) as Record<string, unknown>).length,
          ),
        },
      ],
    });

    await ctx.write({ embeds: [embed] });
  }
}
