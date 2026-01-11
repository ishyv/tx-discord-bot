/**
 * Motivación: registrar el comando "moderation / ban" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import type { GuildCommandContext } from "seyfert";
import {
  Command,
  createStringOption,
  createUserOption,
  Declare,
  Embed,
  InteractionGuildMember,
  Options,
} from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import { MessageFlags } from "seyfert/lib/types";
import { registerCase } from "@/db/repositories/users";

const options = {
  user: createUserOption({
    description: "Usuario a banear",
    required: true,
  }),
  reason: createStringOption({
    description: "Razón del baneo",
    required: true,
  }),
};

@Declare({
  name: "ban",
  description: "Banear a un usuario del servidor",
  defaultMemberPermissions: ["BanMembers"],
  botPermissions: ["BanMembers"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@Options(options)
export default class BanCommand extends Command {
  async run(ctx: GuildCommandContext<typeof options>) {
    const { user, reason } = ctx.options;
    const GuildLogger = await ctx.getGuildLogger();

    if (ctx.author.id === user.id)
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content: "❌ No podés banearte a vos mismo.",
      });

    const targetMember =
      user instanceof InteractionGuildMember ? user : undefined;

    if (!targetMember)
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content: "❌ No se pudo encontrar al miembro a banear en el servidor.",
      });

    if (!(await targetMember.moderatable()))
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content:
          "❌ No podés banear a un usuario con un rol igual o superior al tuyo.",
      });

    const text = `${reason} | Baneado por ${ctx.author.username}`;

    await ctx.client.bans.create(ctx.guildId, user.id, {}, text);

    const successEmbed = new Embed({
      title: "Usuario baneado correctamente",
      description: `
        El usuario **${ctx.options.user.username}** fue baneado exitosamente.

        **Razón:** ${reason}
      `,
      color: EmbedColors.Green,
      footer: {
        text: `Baneado por ${ctx.author.username}`,
        icon_url: ctx.author.avatarURL(),
      },
    });

    await ctx.write({
      flags: MessageFlags.Ephemeral,
      embeds: [successEmbed],
    });

    await registerCase(user.id, ctx.guildId!, "BAN", reason);

    await GuildLogger.banSanctionLog({
      title: "Usuario baneado",
      color: EmbedColors.Red,
      thumbnail: await user.avatarURL(),
      fields: [
        {
          name: "Usuario",
          value: `${user.username} (${user.id})`,
          inline: true,
        },
        { name: "Razón", value: reason, inline: false },
      ],
      footer: {
        text: `${ctx.author.username} (${ctx.author.id})`,
        iconUrl: ctx.author.avatarURL(),
      },
    });
  }
}
