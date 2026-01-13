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
        content: "[tickets] Este ticket ya no pertenece a un servidor valido.",
      });
      return;
    }

    const guildId = ctx.guildId;
    const ticketChannelId = ctx.customId.split(":")[2];
    if (!ticketChannelId) {
      await ctx.write({
        content: "[tickets] No se pudo resolver el canal del ticket.",
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
        "[tickets] no se pudo obtener el canal del ticket",
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
            "[tickets] El canal del ticket ya no existe. Se limpiaron los registros del ticket.",
        });
        return;
      }
      await ctx.write({
        content:
          "[tickets] No se pudo acceder al canal del ticket. Revisa permisos e intentalo nuevamente.",
      });
      return;
    }

    try {
      await ctx.deferUpdate();
    } catch (error) {
      ctx.client.logger?.warn?.("[tickets] no se pudo diferir la interaccion", {
        error,
        ticketChannelId,
      });
    }

    const guildChannels = await getGuildChannels(guildId).catch((error) => {
      ctx.client.logger?.error?.(
        "[tickets] no se pudieron obtener los canales configurados",
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
        "[tickets] el canal de logs configurado no es de texto",
        {
          guildId,
          ticketLogsChannelId,
        },
      );
    }

    const closingEmbed = new Embed()
      .setColor(Colors.info)
      .setTitle("Cerrando ticket")
      .setDescription("El ticket se cerrara en breve...")
      .setFooter({
        text: `Cerrado por ${ctx.author?.username ?? "desconocido"}`,
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
          .setDescription("Transcripcion del ticket")
          .setFile("buffer", transcriptBuffer);

        await logsChannel.messages.write({
          content: `Transcripcion del ticket: ${ticketChannel.name}`,
          files: [transcriptAttachment],
        });

        closingEmbed.setDescription(
          `${closingEmbed.data.description}\nLa transcripcion fue enviada a <#${resolvedLogsChannelId}>.`,
        );
        await ctx.editOrReply({ embeds: [closingEmbed] });
      } catch (error) {
        ctx.client.logger?.error?.(
          "[tickets] fallo al generar o enviar la transcripcion",
          {
            error,
            guildId,
            ticketChannelId,
          },
        );
        closingEmbed.setDescription(
          `${closingEmbed.data.description}\nNo se pudo generar la transcripcion del ticket.`,
        );
        await ctx.editOrReply({ embeds: [closingEmbed] });
      }
    } else {
      closingEmbed.setDescription(
        `${closingEmbed.data.description}\nNo hay canal de logs configurado, el ticket se cerrara sin transcripcion.`,
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
          "[tickets] fallo al borrar el canal del ticket",
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
