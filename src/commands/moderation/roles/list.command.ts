/**
 * Motivación: registrar el comando "moderation / roles / list" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import type { GuildCommandContext } from "seyfert";
import { Declare, Embed, SubCommand } from "seyfert";
import { EmbedColors } from "seyfert/lib/common";

import { GuildStore } from "@/db/repositories/guilds";
import {
  buildModerationSummary,
  fetchManagedRoles,
} from "./shared";

@Declare({
  name: "list",
  description: "Listar roles administrados y sus limites",
})
export default class RoleListCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        embeds: [
          new Embed({
            title: "Roles administrados",
            description: "Este comando solo puede ejecutarse dentro de un servidor.",
            color: EmbedColors.Red,
          }),
        ],
      });
      return;
    }

    await GuildStore.ensure(guildId);

    const roles = await fetchManagedRoles(guildId);

    if (!roles.length) {
      const empty = new Embed({
        title: "Roles administrados",
        description: "No hay configuraciones registradas.",
        color: EmbedColors.Greyple,
      });
      await ctx.write({ embeds: [empty] });
      return;
    }

    const fields = roles.map((role) => ({
      name: `${role.key} - ${role.label}`,
      value: [
        role.discordRoleId
          ? `Rol vinculado: <@&${role.discordRoleId}>`
          : "Rol vinculado: Sin asignar",
        "",
        buildModerationSummary(role),
      ].join("\n"),
    }));

    const embed = new Embed({
      title: "Roles administrados",
      color: EmbedColors.Blurple,
      fields,
    });

    await ctx.write({ embeds: [embed] });
  }
}

