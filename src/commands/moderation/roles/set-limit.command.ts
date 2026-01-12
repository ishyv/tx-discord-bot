/**
 * Motivación: registrar el comando "moderation / roles / set limit" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import type { GuildCommandContext } from "seyfert";
import {
  createIntegerOption,
  createStringOption,
  Declare,
  Embed,
  Options,
  SubCommand,
} from "seyfert";
import { EmbedColors } from "seyfert/lib/common";

import { GuildRolesRepo } from "@/db/repositories/guild-roles";
import {
  buildLimitRecord,
  formatLimitRecord,
  parseLimitWindowInput,
  requireGuildContext,
  resolveActionInput,
} from "./shared";

const options = {
  key: createStringOption({
    description: "Clave del rol administrado",
    required: true,
  }),
  action: createStringOption({
    description: "Accion de moderacion (kick, ban, warn, timeout, purge)",
    required: true,
  }),
  uses: createIntegerOption({
    description: "Cantidad de usos permitidos en la ventana",
    required: true,
    min_value: 1,
  }),
  window: createStringOption({
    description: "Ventana de tiempo (p. ej. 10m, 1h, 6h, 24h, 7d)",
    required: true,
    min_length: 1,
  }),
};

@Declare({
  name: "set-limit",
  description: "Configurar un limite de uso para una accion",
})
@Options(options)
export default class RoleSetLimitCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const context = await requireGuildContext(ctx);
    if (!context) return;

    const key = ctx.options.key.trim();
    if (!key) {
      const embed = new Embed({
        title: "Clave invalida",
        description: "Indica la clave del rol administrado que deseas editar.",
        color: EmbedColors.Red,
      });
      await ctx.write({ embeds: [embed] });
      return;
    }

    const actionResult = resolveActionInput(ctx.options.action);
    if ("error" in actionResult) {
      const embed = new Embed({
        title: "Accion invalida",
        description: actionResult.error,
        color: EmbedColors.Red,
      });
      await ctx.write({ embeds: [embed] });
      return;
    }
    const action = actionResult.action;

    const parsedWindow = parseLimitWindowInput(ctx.options.window);
    if (!parsedWindow) {
      const embed = new Embed({
        title: "Ventana invalida",
        description: "Usa un formato valido como 10m, 1h, 6h, 24h o 7d.",
        color: EmbedColors.Red,
      });
      await ctx.write({ embeds: [embed] });
      return;
    }

    // Ensure role exists
    const rolesRes = await GuildRolesRepo.read(context.guildId);
    const roleRec = rolesRes.isOk() ? (rolesRes.unwrap() as any)[key] : null;
    if (!roleRec) {
      const embed = new Embed({
        title: "Rol no encontrado",
        description:
          "No existe una configuracion registrada con esa clave. Verifica el nombre e intentalo nuevamente.",
        color: EmbedColors.Red,
      });
      await ctx.write({ embeds: [embed] });
      return;
    }

    const uses = Math.max(0, Math.floor(ctx.options.uses));
    const limitRecord = buildLimitRecord(uses, parsedWindow.window);

    await GuildRolesRepo.setLimit(context.guildId, key, action.key, limitRecord).then(r => r.unwrap());

    const updatedRes = await GuildRolesRepo.read(context.guildId);
    const updated = updatedRes.isOk() ? (updatedRes.unwrap() as any)[key] : null;
    const configuredLimits = Object.keys((updated?.limits ?? {}) as Record<string, unknown>).length;

    const embed = new Embed({
      title: "Limite actualizado",
      color: EmbedColors.Blurple,
      fields: [
        { name: "Rol", value: key },
        { name: "Accion", value: action.key },
        { name: "Limite", value: formatLimitRecord(limitRecord) },
        { name: "Limites configurados", value: configuredLimits.toString() },
      ],
    });

    await ctx.write({ embeds: [embed] });
  }
}

