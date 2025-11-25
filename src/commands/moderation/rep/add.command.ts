/**
 * Motivación: registrar el comando "moderation / rep / add" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import {
  createNumberOption,
  createUserOption,
  Declare,
  GuildCommandContext,
  Options,
  SubCommand,
} from "seyfert";

import { adjustUserReputation } from "@/db/repositories";
import { syncUserReputationRoles } from "@/systems/autorole/service";
import {
  buildRepChangeMessage,
  normalizeRepAmount,
  requireRepContext,
} from "./shared";
import { logModerationAction } from "@/utils/moderationLogger";

const options = {
  user: createUserOption({
    description: "Usuario a dar reputacion",
    required: true,
  }),

  amount: createNumberOption({
    description: "Cantidad de reputacion a dar",
    required: true,
  }),
};

@Declare({
  name: "add",
  description: "Dar reputacion a un usuario",
})
@Options(options)
export default class RepAddCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const context = await requireRepContext(ctx);
    if (!context) return;

    const amount = normalizeRepAmount(ctx.options.amount);
    if (amount == null) {
      await ctx.write({
        content: "La cantidad debe ser un numero entero mayor que 0.",
      });
      return;
    }

    const target = ctx.options.user;
    const total = await adjustUserReputation(target.id, amount);
    await syncUserReputationRoles(
      ctx.client,
      context.guildId,
      target.id,
      total,
    );

    await ctx.write({
      content: buildRepChangeMessage("add", amount, target.id, total),
    });

    await logModerationAction(ctx.client, context.guildId, {
      title: "Reputación agregada",
      description: `Se agregaron ${amount} puntos a <@${target.id}>`,
      fields: [
        { name: "Total", value: `${total}`, inline: true },
        { name: "Moderador", value: `<@${ctx.author.id}>`, inline: true },
      ],
      actorId: ctx.author.id,
    },
    "pointsLog");
  }
}
