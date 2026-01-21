/**
 * Motivación: registrar el comando "moderation / restrict" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
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
import {
  RESTRICTED_FORUMS_ROLE_ID,
  RESTRICTED_JOBS_ROLE_ID,
  RESTRICTED_VOICE_ROLE_ID,
} from "@/constants/guild";
import { isSnowflake } from "@/utils/snowflake";

const TYPE_TRANSLATIONS: Record<string, string> = {
  forums: "Foros",
  voice: "Voz",
  jobs: "Empleos",
  all: "Todo",
};

const options = {
  user: createUserOption({
    description: "Usuario a restringir",
    required: true,
  }),
  type: createStringOption({
    description: "Tipo de restringir",
    required: true,
    choices: [
      { name: "Foros", value: "forums" },
      { name: "Voz", value: "voice" },
      { name: "Empleos", value: "jobs" },
      { name: "Todo", value: "all" },
    ],
  }),
  reason: createStringOption({
    description: "Razón de la restricción",
    required: true,
  }),
};

@Declare({
  name: "restrict",
  description: "Restringir de los foros y canales a un usuario",
  defaultMemberPermissions: ["MuteMembers"],
  botPermissions: ["ManageRoles"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@Options(options)
export default class RestrictCommand extends Command {
  async run(ctx: GuildCommandContext<typeof options>) {
    const { user, reason, type } = ctx.options;

    const GuildLogger = await ctx.getGuildLogger();

    if (ctx.author.id === user.id)
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content: "❌ No podés restringirte a vos mismo.",
      });

    const targetMember =
      user instanceof InteractionGuildMember ? user : undefined;

    if (!targetMember)
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content:
          "❌ No se pudo encontrar al miembro a restringir en el servidor.",
      });

    if (!(await targetMember.moderatable()))
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content:
          "❌ No podés restringir a un usuario con un rol igual o superior al tuyo.",
      });

    if (!ctx.guildId || !isSnowflake(ctx.guildId) || !isSnowflake(user.id)) {
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content: "❌ IDs invalidos. Intenta nuevamente.",
      });
    }

    const roles: Record<string, string | string[]> = {
      jobs: RESTRICTED_JOBS_ROLE_ID,
      forums: RESTRICTED_FORUMS_ROLE_ID,
      voice: RESTRICTED_VOICE_ROLE_ID,
      all: [
        RESTRICTED_JOBS_ROLE_ID,
        RESTRICTED_FORUMS_ROLE_ID,
        RESTRICTED_VOICE_ROLE_ID,
      ],
    };

    const targetRoles = roles[type];
    const roleIds = Array.isArray(targetRoles) ? targetRoles : [targetRoles];
    const invalidRole = roleIds.find((roleId) => !isSnowflake(roleId));
    if (invalidRole) {
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content: "❌ Rol de restricción inválido configurado. Contacta al staff.",
      });
    }

    if (Array.isArray(targetRoles)) {
      await Promise.all(
        targetRoles.map((roleId) => targetMember.roles.add(roleId)),
      );
    } else {
      await targetMember.roles.add(targetRoles);
    }

    const successEmbed = new Embed({
      title: "Usuario restringido correctamente",
      description: `
        El usuario **${ctx.options.user.username}** fue restringido exitosamente.

        **Razón:** ${reason}
        **Restricción:** ${TYPE_TRANSLATIONS[type]}
      `,
      color: EmbedColors.Green,
      footer: {
        text: `Restringido por ${ctx.author.username}`,
        icon_url: ctx.author.avatarURL() || undefined,
      },
    });

    await ctx.write({
      flags: MessageFlags.Ephemeral,
      embeds: [successEmbed],
    });

    await GuildLogger.banSanctionLog({
      title: "Usuario restringido",
      color: EmbedColors.DarkOrange,
      thumbnail: await user.avatarURL(),
      fields: [
        {
          name: "Usuario",
          value: `${user.username} (${user.id})`,
          inline: true,
        },
        { name: "Razón", value: reason, inline: false },
        { name: "Restricción", value: TYPE_TRANSLATIONS[type], inline: false },
      ],
      footer: {
        text: `${ctx.author.username} (${ctx.author.id})`,
        iconUrl: ctx.author.avatarURL(),
      },
    });
  }
}
