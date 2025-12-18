/**
 * Motivación: encapsular el handler de componente "close ticket button" para enrutar customId al sistema de UI sin duplicar filtros ni wiring.
 *
 * Idea/concepto: extiende las primitivas de Seyfert para componentes y delega en el registro de UI la resolución del callback adecuado.
 *
 * Alcance: filtra y despacha interacciones de este tipo; no define la lógica interna de cada componente ni su contenido visual.
 */
/**
 * Closes ticket channels with a short grace period so staff can trigger the flow
 * from any context.  The transcription and audit logging live in the ticket
 * system; this component just glues the interaction to those services.
 */

import {
  AttachmentBuilder,
  ComponentCommand,
  type ComponentContext,
  Embed,
  type TextGuildChannel,
} from "seyfert";

import { getGuildChannels } from "@/modules/guild-channels";
import { Colors } from "@/modules/ui/colors";
import { TICKET_CLOSE_BUTTON_ID } from "@/systems/tickets";
import { closeTicket } from "@/systems/tickets/shared";
import { create_transcription } from "@/systems/tickets/transcription";

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

    const closingEmbed = new Embed()
      .setColor(Colors.info)
      .setTitle("Cerrando ticket")
      .setDescription("El ticket se cerrara en breve...")
      .setFooter({
        text: `Cerrado por ${ctx.author?.username ?? "desconocido"}`,
      });

    await ctx.editOrReply({ embeds: [closingEmbed] });

    if (ticketLogsChannelId) {
      try {
        const transcriptBuffer = await create_transcription(
          ctx.client,
          ticketChannelId,
        );
        const transcriptAttachment = new AttachmentBuilder()
          .setName("transcript.html")
          .setDescription("Transcripcion del ticket")
          .setFile("buffer", transcriptBuffer);

        const logsChannel =
          await ctx.client.channels.fetch(ticketLogsChannelId);
        if (logsChannel?.isTextGuild()) {
          await logsChannel.messages.write({
            content: `Transcripcion del ticket: ${ticketChannel.name}`,
            files: [transcriptAttachment],
          });

          closingEmbed.setDescription(
            `${closingEmbed.data.description}\nLa transcripcion fue enviada a <#${ticketLogsChannelId}>.`,
          );
          await ctx.editOrReply({ embeds: [closingEmbed] });
        } else {
          ctx.client.logger?.error?.(
            "[tickets] el canal de logs configurado no es de texto",
            {
              guildId,
              ticketLogsChannelId,
            },
          );
        }
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
