/**
 * Motivación: registrar el comando "moderation / roles / set" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
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
import { EmbedColors } from "seyfert/lib/common";

import { GuildStore } from "@/db/repositories/guilds";
import { GuildRolesRepo } from "@/db/repositories/guild-roles";

import { requireGuildContext } from "./shared";

const options = {
  key: createStringOption({
    description: "Identificador interno del rol administrado",
    required: true,
  }),
  role: createRoleOption({
    description: "Rol de Discord al que se aplicara la configuracion",
    required: true,
  }),
};

@Declare({
  name: "set",
  description: "Registrar o actualizar un rol administrado",
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
        title: "Clave invalida",
        description: "Proporciona una clave no vacia para registrar el rol.",
        color: EmbedColors.Red,
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
      title: "Rol administrado registrado",
      color: EmbedColors.Green,
      fields: [
        { name: "Clave", value: key },
        {
          name: "Rol",
          value: role?.discordRoleId ? `<@&${role.discordRoleId}>` : "Sin asignar",
        },
        {
          name: "Limites configurados",
          value: String(Object.keys((role?.limits ?? {}) as Record<string, unknown>).length),
        },
      ],
    });

    await ctx.write({ embeds: [embed] });
  }
}

