/**
 * Handler de botón "cerrar ticket" (UI -> dominio).
 *
 * Encaje: componente Seyfert que filtra por `TICKET_CLOSE_BUTTON_ID` y coordina
 * transcripción, logs y eliminación de canal antes de sincronizar DB.
 * Dependencias: `guild-channels` para resolver logs, `transcription` para HTML,
 * `closeTicket` para limpiar estado en repos, `channelGuard` para sanear rutas.
 * Invariantes: `customId` debe seguir formato `tickets:close:{channelId}`;
 * aplica un delay de gracia antes de borrar el canal.
 * Gotchas: si el canal ya no existe, limpia estado y responde; si no hay canal
 * de logs, cierra sin transcripción. Errores de UI no deben bloquear el cierre.
 */

import {
  AttachmentBuilder,
  ComponentCommand,
  type ComponentContext,
  Embed,
  type TextGuildChannel,
} from "seyfert";

import { updateGuildPaths } from "@/db/repositories/guilds";
import { getGuildChannels } from "@/modules/guild-channels";
import { Colors } from "@/modules/ui/colors";
import { TICKET_CLOSE_BUTTON_ID } from "@/systems/tickets";
import { closeTicket } from "@/systems/tickets/shared";
import { create_transcription } from "@/systems/tickets/transcription";
import { fetchStoredChannel } from "@/utils/channelGuard";

const CLOSE_DELAY_MS = 5_000;

export default class CloseTicketButton extends ComponentCommand {
  componentType = "Button" as const;

  filter(ctx: ComponentContext<"Button">) {
    return ctx.customId.startsWith(TICKET_CLOSE_BUTTON_ID);
  }

  async run(ctx: ComponentContext<"Button">) {
    if (!ctx.guildId) {
      await ctx.write({
        content: "[tickets] This ticket is no longer associated with a valid server.",
      });
      return;
    }

    const guildId = ctx.guildId;
    const ticketChannelId = ctx.customId.split(":")[2];
    if (!ticketChannelId) {
      await ctx.write({
        content: "[tickets] Could not resolve the ticket channel.",
      });
      return;
    }

    let ticketChannel: TextGuildChannel | null = null;
    let channelMissing = false;
    try {
      const fetched = await ctx.client.channels.fetch(ticketChannelId);
      ticketChannel = fetched?.isTextGuild() ? fetched : null;
      channelMissing = !fetched;
    } catch (error) {
      const code =
        typeof error === "object" &&
        error &&
        "code" in (error as Record<string, unknown>)
          ? Number((error as { code?: number }).code)
          : undefined;
      channelMissing = code === 10003;
      ctx.client.logger?.error?.(
        "[tickets] failed to fetch ticket channel",
        {
          error,
          ticketChannelId,
        },
      );
    }

    if (!ticketChannel) {
      if (channelMissing) {
        await closeTicket(guildId, ticketChannelId);
      await ctx.write({
        content:
          "[tickets] The ticket channel no longer exists. Ticket records were cleaned up.",
      });
      return;
      }
      await ctx.write({
        content:
          "[tickets] Could not access the ticket channel. Check permissions and try again.",
      });
      return;
    }

    try {
      await ctx.deferUpdate();
    } catch (error) {
      ctx.client.logger?.warn?.("[tickets] failed to defer interaction", {
        error,
        ticketChannelId,
      });
    }

    const guildChannels = await getGuildChannels(guildId).catch((error) => {
      ctx.client.logger?.error?.(
        "[tickets] failed to load configured channels",
        {
          error,
          guildId,
        },
      );
      return null;
    });
    const core = guildChannels?.core as
      | Record<string, { channelId: string } | null>
      | undefined;
    const ticketLogsChannelId = core?.ticketLogs?.channelId ?? null;
    const fetchedLogs = ticketLogsChannelId
      ? await fetchStoredChannel(ctx.client, ticketLogsChannelId, () =>
          updateGuildPaths(guildId, {
            "channels.core.ticketLogs": null,
          }),
        )
      : null;
    const logsChannel =
      fetchedLogs?.channel && fetchedLogs.channel.isTextGuild()
        ? fetchedLogs.channel
        : null;
    const resolvedLogsChannelId = logsChannel
      ? (fetchedLogs?.channelId ?? null)
      : null;
    if (fetchedLogs?.channel && !logsChannel) {
      ctx.client.logger?.error?.(
        "[tickets] configured logs channel is not a text channel",
        {
          guildId,
          ticketLogsChannelId,
        },
      );
    }

    const closingEmbed = new Embed()
      .setColor(Colors.info)
      .setTitle("Closing ticket")
      .setDescription("The ticket will be closed shortly...")
      .setFooter({
        text: `Closed by ${ctx.author?.username ?? "unknown"}`,
      });

    await ctx.editOrReply({ embeds: [closingEmbed] });

    if (resolvedLogsChannelId && logsChannel) {
      try {
        // WHY: generamos la transcripción antes de borrar el canal para no perder
        // historial; si falla, el cierre continúa pero sin adjunto.
        const transcriptBuffer = await create_transcription(
          ctx.client,
          ticketChannelId,
        );
        const transcriptAttachment = new AttachmentBuilder()
          .setName("transcript.html")
          .setDescription("Ticket transcript")
          .setFile("buffer", transcriptBuffer);

        await logsChannel.messages.write({
          content: `Ticket transcript: ${ticketChannel.name}`,
          files: [transcriptAttachment],
        });

        closingEmbed.setDescription(
          `${closingEmbed.data.description}\nThe transcript was sent to <#${resolvedLogsChannelId}>.`,
        );
        await ctx.editOrReply({ embeds: [closingEmbed] });
      } catch (error) {
        ctx.client.logger?.error?.(
          "[tickets] failed to generate or send transcript",
          {
            error,
            guildId,
            ticketChannelId,
          },
        );
        closingEmbed.setDescription(
          `${closingEmbed.data.description}\nCould not generate the ticket transcript.`,
        );
        await ctx.editOrReply({ embeds: [closingEmbed] });
      }
    } else {
      closingEmbed.setDescription(
        `${closingEmbed.data.description}\nNo logs channel is configured, the ticket will close without a transcript.`,
      );
      await ctx.editOrReply({ embeds: [closingEmbed] });
    }

    await new Promise((resolve) => setTimeout(resolve, CLOSE_DELAY_MS));

    try {
      await ctx.client.channels.delete(ticketChannelId);
    } catch (error) {
      // RISK: solo ignoramos error 10003 (canal inexistente); otros errores
      // dejan el estado sin limpiar para no ocultar problemas de permisos.
      const code =
        typeof error === "object" &&
        error &&
        "code" in (error as Record<string, unknown>)
          ? Number((error as { code?: number }).code)
          : undefined;

      if (code !== 10003) {
        ctx.client.logger?.error?.(
          "[tickets] failed to delete ticket channel",
          {
            error,
            guildId,
            ticketChannelId,
          },
        );
        return;
      }
    }

    await closeTicket(guildId, ticketChannelId);

    // ctx.client.logger?.info?.("[tickets] ticket cerrado", {
    //   guildId,
    //   ticketChannelId,
    //   closedBy: ctx.author?.id,
    // });
  }
}

