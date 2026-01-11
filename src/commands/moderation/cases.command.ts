import { Command, Declare, Options, Embed, createUserOption, type GuildCommandContext } from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import { MessageFlags } from "seyfert/lib/types";
import { findUser } from "@/db/repositories/users";
import { SanctionType } from "@/db/schemas/user";

const options = {
    user: createUserOption({
        description: "Usuario del que quieres ver el historial de casos",
        required: false,
    }),
};

@Declare({
    name: "cases",
    description: "Muestra el historial de sanciones de un usuario en este servidor",
    contexts: ["Guild"],
    integrationTypes: ["GuildInstall"],
})
@Options(options)
export default class CasesCommand extends Command {
    async run(ctx: GuildCommandContext<typeof options>) {
        const userOption = ctx.options.user;
        const targetId = userOption ? userOption.id : ctx.author.id;
        const targetName = userOption ? userOption.username : ctx.author.username;

        // Si el usuario es target, intentamos obtener avatarUrl, si no, es ctx.author
        const targetAvatar = userOption
            ? (await userOption.avatarURL())
            : ctx.author.avatarURL();

        const userResult = await findUser(targetId);

        if (userResult.isErr()) {
            return ctx.write({
                flags: MessageFlags.Ephemeral,
                content: "❌ Hubo un error al buscar el historial del usuario.",
            });
        }

        const userData = userResult.unwrap();
        if (!userData) {
            return ctx.write({
                flags: MessageFlags.Ephemeral,
                content: "❌ No se encontraron registros de este usuario en la base de datos.",
            });
        }

        const guildId = ctx.guildId!;
        const history = userData.sanction_history?.[guildId] ?? [];

        if (history.length === 0) {
            return ctx.write({
                flags: MessageFlags.Ephemeral,
                content: `📁 El usuario **${targetName}** no tiene casos registrados en este servidor.`,
            });
        }

        // Ordenamos por fecha descendente (más reciente primero)
        const sortedHistory = [...history].reverse().slice(0, 15); // Limite de 15 para no saturar

        const description = sortedHistory.map((entry, index) => {
            const typeEmoji = this.getEmojiForType(entry.type);
            const date = entry.date ? `<t:${Math.floor(new Date(entry.date).getTime() / 1000)}:d>` : "N/A";
            return `**${index + 1}.** ${typeEmoji} **${entry.type}** — ${date}\n> ${entry.description}`;
        }).join("\n\n");

        const embed = new Embed({
            title: `Historial de casos de ${targetName}`,
            description: description,
            color: EmbedColors.Blue,
            footer: {
                text: `Mostrando últimos ${sortedHistory.length} casos | ID: ${targetId}`,
                icon_url: targetAvatar,
            },
            timestamp: new Date().toISOString(),
        });

        await ctx.write({
            flags: MessageFlags.Ephemeral,
            embeds: [embed],
        });
    }

    private getEmojiForType(type: SanctionType): string {
        switch (type) {
            case "BAN": return "🔨";
            case "KICK": return "👢";
            case "TIMEOUT": return "🔇";
            case "WARN": return "⚠️";
            default: return "📝";
        }
    }
}
