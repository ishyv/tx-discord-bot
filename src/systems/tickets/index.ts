/**
 * Motivación: implementar el sistema tickets (index) para automatizar ese dominio sin duplicar lógica.
 *
 * Idea/concepto: organiza orquestadores y helpers específicos que combinan servicios, repositorios y eventos.
 *
 * Alcance: resuelve flujos del sistema; no define comandos ni middleware transversales.
 */
/**
 * Ticket system utilities coordinate between UI components and the backing repo.
 * Centralising the constants and builders here keeps the commands/components
 * lightweight while ensuring every ticket entry point behaves consistently.
 */

import {
  ActionRow,
  Button,
  Embed,
  Modal,
  StringSelectMenu,
  StringSelectOption,
  TextInput,
  type UsingClient,
} from "seyfert";
import { ButtonStyle, MessageFlags, TextInputStyle } from "seyfert/lib/types";
import { updateGuildPaths } from "@/db/repositories/guilds";
import { Features, isFeatureEnabled } from "@/modules/features";
import { getGuildChannels } from "@/modules/guild-channels";
import { openTicket } from "@/modules/tickets/service";
import { Colors } from "@/modules/ui/colors";
import { fetchStoredChannel } from "@/utils/channelGuard";

export const TICKET_SELECT_CUSTOM_ID = "tickets:category";
export const TICKET_MODAL_PREFIX = "tickets:modal";
export const TICKET_DETAILS_INPUT_ID = "ticket_details";

// Format {PREFIX}:{ChannelId} to uniquely identify the ticket to close
export const TICKET_CLOSE_BUTTON_ID = "tickets:close";
export const MAX_TICKETS_PER_USER = 1;

export interface TicketCategory {
  id: string;
  label: string;
  description: string;
  emoji: string;
}

export const TICKET_CATEGORIES: readonly TicketCategory[] = [
  {
    id: "report",
    label: "Reportar",
    description: "Denunciar mal comportamiento de otros usuarios.",
    emoji: "\u2757",
  },
  {
    id: "featured",
    label: "Aviso Destacado",
    description: "Compra o consulta por publicidad en el servidor.",
    emoji: "\uD83D\uDCE3",
  },
  {
    id: "workshop",
    label: "Quiero dar un Taller",
    description: "Quieres dar un taller en el servidor?",
    emoji: "\uD83C\uDF93",
  },
  {
    id: "alliance",
    label: "Solicitar alianza de servidor",
    description: "Minimo 300 usuarios y debe cumplir la ToS de Discord.",
    emoji: "\uD83E\uDD1D",
  },
  {
    id: "general",
    label: "General",
    description: "Si ninguna de las opciones anteriores aplica.",
    emoji: "\u2754",
  },
] as const;

function messageHasTicketSelector(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;

  const maybe = message as { components?: unknown };
  if (!Array.isArray(maybe.components)) return false;

  return maybe.components.some((row) => {
    if (!row || typeof row !== "object") return false;
    const rowObj = row as { components?: unknown };
    if (!Array.isArray(rowObj.components)) return false;

    return rowObj.components.some((component) => {
      if (!component || typeof component !== "object") return false;
      const componentObj = component as { customId?: unknown };
      return (
        typeof componentObj.customId === "string" &&
        componentObj.customId.startsWith(TICKET_SELECT_CUSTOM_ID)
      );
    });
  });
}

/**
 * Ensures that the ticket message exists in the designated channel.
 * If the message does not exist, it will be created.
 * If there are stale messages, they will be deleted.
 * This will be called automatically on bot startup and when the ticket channel is configured via /tickets config or /channels set.
 * @param client The Discord client instance.
 */
export async function ensureTicketMessage(client: UsingClient): Promise<void> {
  const guilds = await client.guilds.list();
  const botId = client.me?.id ?? null;

  for (const guildId of guilds.map((g) => g.id)) {
    const ticketsEnabled = await isFeatureEnabled(guildId, Features.Tickets);
    if (!ticketsEnabled) {
      client.logger?.info?.(
        "[tickets] dashboard deshabilitado; no se mostrara mensaje",
        {
          guildId,
        },
      );
      continue;
    }

    const channels = await getGuildChannels(guildId);
    const core = channels.core as Record<string, { channelId: string } | null>;
    const ticketChannel = core.tickets;
    const fetched = await fetchStoredChannel(client, ticketChannel?.channelId, () =>
      updateGuildPaths(guildId, {
        "channels.core.tickets": null,
      }),
    );
    const channelId = fetched.channelId;
    if (!channelId || !fetched.channel) {
      client.logger?.warn?.("[tickets] no `tickets` channel; skipping.");
      continue;
    }
    if (!fetched.channel.isTextGuild()) {
      client.logger?.warn?.("[tickets] configured tickets channel is not text.", {
        guildId,
        channelId,
      });
      continue;
    }

    const storedTicketMessageId =
      typeof channels.ticketMessageId === "string"
        ? channels.ticketMessageId
        : null;

    if (storedTicketMessageId && botId) {
      const existing = await client.messages
        .fetch(storedTicketMessageId, channelId)
        .catch(() => null);

      if (
        existing &&
        existing.author?.id === botId &&
        messageHasTicketSelector(existing)
      ) {
        continue;
      }
    }

    const recent = await client.messages
      .list(channelId, { limit: 100 })
      .catch((error) => {
        client.logger?.warn?.("[tickets] failed to list messages for channel", {
          error,
          guildId,
          channelId,
        });
        return [];
      });

    const prompts = botId
      ? recent.filter(
          (m) => m?.author?.id === botId && messageHasTicketSelector(m),
        )
      : recent.filter((m) => messageHasTicketSelector(m));

    if (prompts.length > 0) {
      const keep = prompts[0];

      for (const m of prompts.slice(1)) {
        try {
          await client.messages.delete(m.id, channelId);
        } catch (error) {
          client.logger?.warn?.(
            "[tickets] failed to delete stale prompt message",
            {
              error,
              guildId,
              channelId,
              messageId: m.id,
            },
          );
        }
      }

      if (typeof keep.id === "string") {
        await updateGuildPaths(guildId, {
          "channels.ticketMessageId": keep.id,
        }).catch((error) => {
          client.logger?.warn?.(
            "[tickets] failed to persist ticket prompt id",
            {
              error,
              guildId,
              channelId,
              messageId: keep.id,
            },
          );
        });
      }

      continue;
    }

    const payload = buildTicketMessagePayload();
    const created = await client.messages.write(channelId, payload);

    await updateGuildPaths(guildId, {
      "channels.ticketMessageId": created.id,
    }).catch((error) => {
      client.logger?.warn?.("[tickets] failed to persist ticket prompt id", {
        error,
        guildId,
        channelId,
        messageId: created.id,
      });
    });
  }
}

export function buildTicketModal(category: TicketCategory): Modal {
  return (
    new Modal()
      .setCustomId(`${TICKET_MODAL_PREFIX}:${category.id}`)
      .setTitle(`Ticket: ${category.label}`)
      .addComponents(
        new ActionRow<TextInput>().addComponents(
          new TextInput()
            .setCustomId(TICKET_DETAILS_INPUT_ID)
            .setLabel("Describe tu solicitud")
            .setPlaceholder(
              "Incluye contexto, enlaces o evidencias que consideres necesarias.",
            )
            .setRequired(true)
            .setLength({ min: 8, max: 1000 })
            .setStyle(TextInputStyle.Paragraph),
        ),
      )

      /* Cuando se envia el modal -- creacion de ticket */
      .run(async (ctx) => {
        const content = ctx.getInputValue(TICKET_DETAILS_INPUT_ID, true);
        const guildId = ctx.guildId;
        const userId = ctx.user?.id;

        if (!guildId) {
          await ctx.write({
            content:
              "No se pudo crear el ticket porque no pudimos detectar el servidor.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (!userId) {
          await ctx.write({
            content: "No pudimos identificar tu usuario. Intentalo nuevamente.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const ticketsEnabled = await isFeatureEnabled(
          guildId,
          Features.Tickets,
        );
        if (!ticketsEnabled) {
          await ctx.write({
            content:
              "El sistema de tickets está deshabilitado actualmente por los administradores.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const channels = await getGuildChannels(guildId);
        const ticketCategoryRecord =
          (
            channels.core as Record<
              string,
              { channelId: string } | null | undefined
            >
          )?.ticketCategory ?? null;
        const fetchedCategory = await fetchStoredChannel(
          ctx.client,
          ticketCategoryRecord?.channelId,
          () =>
            updateGuildPaths(guildId, {
              "channels.core.ticketCategory": null,
            }),
        );
        const ticketCategoryId = fetchedCategory.channelId;

        if (!ticketCategoryId || !fetchedCategory.channel) {
          await ctx.write({
            content:
              "No hay una categoria configurada para tickets. Avisale a un administrador.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const channelName = buildTicketChannelName(ctx.user?.username);

        const opened = await openTicket(
          ctx.client,
          {
            guildId,
            userId,
            parentId: ticketCategoryId,
            channelName,
          },
          MAX_TICKETS_PER_USER,
        );
        if (opened.isErr()) {
          const reason =
            opened.error?.message === "TICKET_LIMIT_REACHED"
              ? "Ya tienes un ticket abierto. Cierra el anterior antes de crear uno nuevo."
              : "Ocurrio un error al crear tu ticket. Intentalo nuevamente en unos segundos.";
          if (opened.error?.message !== "TICKET_LIMIT_REACHED") {
            ctx.client.logger?.error?.("[tickets] failed to open ticket", {
              error: opened.error,
              guildId,
              userId,
            });
          }
          await ctx.write({
            content: reason,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const ticketChannelId = opened.unwrap().channelId;

        const welcomeEmbed = new Embed()
          .setColor(Colors.info)
          .setTitle(`Ticket - ${category.label}`)
          .setDescription(
            "Por favor, agrega toda la informacion relevante a tu solicitud mientras esperas...",
          )
          .setFooter({
            text: `Creado por ${ctx.user?.username || "???"}`,
          });

        const reasonEmbed = new Embed()
          .setColor(Colors.info)
          .setTitle("Razon del Ticket")
          .setDescription(content);

        const row = new ActionRow<Button>().addComponents(
          new Button()
            .setCustomId(`${TICKET_CLOSE_BUTTON_ID}:${ticketChannelId}`)
            .setLabel("Cerrar Ticket")
            .setStyle(ButtonStyle.Danger), // Discord no admite botones naranja; Danger es lo más cercano.
        );

        await ctx.client.messages.write(ticketChannelId, {
          embeds: [welcomeEmbed],
          allowed_mentions: {
            parse: [] as ("roles" | "users" | "everyone")[],
          },
        });

        await ctx.client.messages.write(ticketChannelId, {
          embeds: [reasonEmbed],
          components: [row],
          allowed_mentions: {
            parse: [] as ("roles" | "users" | "everyone")[],
          },
        });

        await ctx.write({
          content: `✅ Gracias! Tu ticket fue enviado: <#${ticketChannelId}>`,
          flags: MessageFlags.Ephemeral,
        });
      })
  );
}

function buildTicketMessagePayload() {
  const embed = new Embed()
    .setColor("Blurple")
    .setTitle("Gestión de tickets")
    .setDescription(
      [
        "# Elije el tipo de ticket a abrir",
        "",
        "Abajo puedes elegir el tipo de ticket que deseas abrir para hablar con los administradores.",
      ].join("\n"),
    )
    .setFooter({
      text: `Los tickets NO son para soporte técnico. Usa uno de los foros públicos para eso.`,
    });

  const menu = new StringSelectMenu()
    .setCustomId(TICKET_SELECT_CUSTOM_ID)
    .setPlaceholder("Selecciona el tipo de ticket")
    .setValuesLength({ min: 1, max: 1 });

  for (const category of TICKET_CATEGORIES) {
    menu.addOption(
      new StringSelectOption()
        .setLabel(category.label)
        .setDescription(category.description)
        .setEmoji(category.emoji)
        .setValue(category.id),
    );
  }

  const row = new ActionRow().addComponents(menu);

  return {
    embeds: [embed],
    components: [row],
    allowed_mentions: { parse: [] as ("roles" | "users" | "everyone")[] },
  };
}
export function getTicketCategory(
  categoryId: string,
): TicketCategory | undefined {
  return TICKET_CATEGORIES.find((category) => category.id === categoryId);
}

function buildTicketChannelName(username: string | undefined): string {
  const base = (username ?? "usuario").normalize("NFD");
  const sanitized = base
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();

  const suffix = sanitized || "usuario";
  return `reporte-${suffix}`.slice(0, 100);
}
