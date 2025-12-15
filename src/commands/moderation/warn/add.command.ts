/**
 * Motivación: registrar el comando "moderation / warn / add" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import type { GuildCommandContext } from "seyfert";
import {
	createStringOption,
	createUserOption,
	Declare,
	Embed,
	Options,
	SubCommand,
} from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import type { Warn } from "@/db/schemas/user";
import { generateWarnId } from "@/utils/warnId";
import { addWarn, listWarns } from "@/db/repositories";
import { BindDisabled, Features } from "@/modules/features";
import { logModerationAction } from "@/utils/moderationLogger";

const options = {
	user: createUserOption({
		description: "Usuario al que se le aplicara un warn",
		required: true,
	}),
	reason: createStringOption({
		description: "Razon del warn",
		required: false,
	}),
};

@Declare({
	name: "add",
	description: "Anadir un warn a un usuario",
	defaultMemberPermissions: ["KickMembers"],
})
@Options(options)
@BindDisabled(Features.Warns)
export default class AddWarnCommand extends SubCommand {
	async run(ctx: GuildCommandContext<typeof options>) {
		const guildId = ctx.guildId;
		if (!guildId) {
			await ctx.write({ content: "Este comando solo funciona dentro de un servidor." });
			return;
		}

		const { user, reason } = ctx.options;
		const warnsResult = await listWarns(user.id);
		if (warnsResult.isErr()) {
			await ctx.write({ content: "No se pudieron leer los warns del usuario." });
			return;
		}
		const existingWarns = warnsResult.unwrap();
		const existingIds = new Set(existingWarns.map((warn) => warn.warn_id));

		let warnId = generateWarnId();
		while (existingIds.has(warnId)) {
			warnId = generateWarnId();
		}

		const finalReason = reason || "Razon no especificada";

		const warn: Warn = {
			reason: finalReason,
			warn_id: warnId,
			moderator: ctx.author.id,
			timestamp: new Date().toISOString(),
		};

		const addResult = await addWarn(user.id, warn);
		if (addResult.isErr()) {
			await ctx.write({ content: "No se pudo registrar el warn." });
			return;
		}

		const successEmbed = new Embed({
			title: "Warn aplicado",
			description: [
				`Se anadio un warn al usuario **${user.username}**.`,
				"",
				`**Razon:** ${finalReason}`,
				`**ID del warn:** ${warnId.toUpperCase()}`,
			].join("\n"),
			color: EmbedColors.Green,
			footer: {
				text: `Warn aplicado por ${ctx.author.username}`,
				icon_url: ctx.author.avatarURL() || undefined,
			},
		});

		await ctx.write({ embeds: [successEmbed] });

		await logModerationAction(ctx.client, guildId, {
			title: "Warn aplicado",
			description: `Se agregó un warn a <@${user.id}>`,
			fields: [
				{ name: "ID del warn", value: warnId.toUpperCase(), inline: true },
				{ name: "Moderador", value: `<@${ctx.author.id}>`, inline: true },
				{ name: "Razón", value: finalReason },
			],
			actorId: ctx.author.id,
		});
	}
}
