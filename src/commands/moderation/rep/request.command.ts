import {
    createStringOption,
    Declare,
    GuildCommandContext,
    Options,
    SubCommand,
    Middlewares,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { updateGuildPaths } from "@/db/repositories/guilds";
import { getCoreChannel } from "@/modules/guild-channels";
import { CoreChannelNames } from "@/modules/guild-channels/constants";
import { fetchStoredChannel } from "@/utils/channelGuard";
import { sendReputationRequest } from "./shared";
import { Guard } from "@/middlewares/guards/decorator";
import { Features } from "@/modules/features";

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
@Guard({
    guildOnly: true,
    feature: Features.Reputation,
})
@Middlewares(["guard"])
@Cooldown({
    type: CooldownType.User,
    interval: 300_000, // 5 minutes
    uses: { default: 1 },
})
export default class RepRequestCommand extends SubCommand {
    async run(ctx: GuildCommandContext<typeof options>) {
        const guildId = ctx.guildId;
        // Ack early to avoid timeouts when channel fetches or writes are slow.
        await ctx.deferReply(true);

        const repChannelConfig = await getCoreChannel(
            guildId,
            CoreChannelNames.RepRequests
        );
        const fetched = await fetchStoredChannel(ctx.client, repChannelConfig?.channelId, () =>
            updateGuildPaths(guildId, {
                "channels.core.repRequests": null,
            }),
        );

        const repChannel = fetched.channel;
        if (!fetched.channelId || !repChannel) {
            await ctx.write({
                content: "Las solicitudes de reputacion no estan configuradas en este servidor.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (!repChannel.isTextGuild()) {
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

        if (guildIdFromLink !== guildId) {
            await ctx.write({
                content: "El enlace no pertenece a este servidor.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const targetChannel = await ctx.client.channels.fetch(channelIdFromLink);
        if (!targetChannel || !targetChannel.isTextGuild()) {
            await ctx.write({
                content: "No se pudo acceder al canal del mensaje proporcionado.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        try {
            const targetMessage = await targetChannel.messages.fetch(messageIdFromLink);
            await sendReputationRequest(repChannel, targetMessage, ctx.author);

            await ctx.write({
                content: "Tu solicitud de reputacion ha sido enviada al equipo de moderacion.",
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            await ctx.write({
                content: "No se pudo encontrar el mensaje o no tengo permisos para leerlo.",
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
