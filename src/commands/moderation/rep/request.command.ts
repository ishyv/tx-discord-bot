/**
 * Motivación: registrar el comando "moderation / rep / request" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import {
    createStringOption,
    Declare,
    GuildCommandContext,
    Options,
    SubCommand,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { getGuildChannels } from "@/modules/guild-channels";
import { requireRepContext, sendReputationRequest } from "./shared";

const options = {
    message_link: createStringOption({
        description: "Enlace al mensaje por el cual solicitas reputacion",
        required: true,
    }),
};

/**
 * Slash subcommand that lets any guild user raise a reputation review request.
 * - Validates that the reputation system is enabled and that a repRequests channel is configured.
 * - Forwards the request to that channel with staff buttons (aceptar/set/rechazar/cerrar/penalizar).
 * - Enforces a per-user cooldown (5m base) to avoid spam.
 */
@Declare({
    name: "request",
    description: "Solicitar una revision de reputacion al staff",
})
@Options(options)
@Cooldown({
    type: CooldownType.User,
    interval: 300_000, // 5 minutes
    uses: { default: 1 },
})
export default class RepRequestCommand extends SubCommand {
    async run(ctx: GuildCommandContext<typeof options>) {
        // Ack early to avoid timeouts when channel fetches or writes are slow.
        await ctx.deferReply(true);

        const context = await requireRepContext(ctx, { requirePermission: false });
        if (!context) return;

        const guildChannels = await getGuildChannels(context.guildId);
        const repChannelId = guildChannels?.core?.repRequests?.channelId;

        if (!repChannelId) {
            await ctx.write({
                content: "Las solicitudes de reputacion no estan configuradas en este servidor.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const repChannel = await ctx.client.channels.fetch(repChannelId);
        if (!repChannel || !repChannel.isTextGuild()) {
            await ctx.write({
                content: "El canal de solicitudes de reputacion no es valido o no es de texto.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const { message_link } = ctx.options;

        const linkMatch = message_link.match(
            /^https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)$/
        );

        if (!linkMatch) {
            await ctx.write({
                content: "El enlace proporcionado no es valido. Usa el enlace directo al mensaje.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const [, guildIdFromLink, channelIdFromLink, messageIdFromLink] = linkMatch;

        if (guildIdFromLink !== ctx.guildId) {
            await ctx.write({
                content: "El enlace no pertenece a este servidor.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const targetChannel = await ctx.client.channels.fetch(channelIdFromLink).catch(() => null);
        if (!targetChannel?.isTextGuild() || targetChannel.guildId !== ctx.guildId) {
            await ctx.write({
                content: "El enlace apunta a un canal invalido o fuera de este servidor.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const targetMessage = await ctx.client.messages
            .fetch(messageIdFromLink, channelIdFromLink)
            .catch(() => null);
        if (!targetMessage) {
            await ctx.write({
                content: "No se pudo encontrar el mensaje indicado. Verifica el enlace.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }


        const requester = ctx.author;

        await sendReputationRequest(repChannel, targetMessage, requester);

        await ctx.editOrReply({
            content: "Tu solicitud de reputacion ha sido enviada al staff.",
            flags: MessageFlags.Ephemeral
        });
    }
}
