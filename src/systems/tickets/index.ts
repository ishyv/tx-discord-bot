/**
 * Ticket system entrypoint: keeps UI prompts, modal builders, and limits in one place.
 *
 * Context: Bridge between commands/components and ticket services (repositories,
 * features, channels). Component IDs, the initial payload, and the 
 * deduplication invariants of the ticket message per guild are defined here.
 *
 * Key Dependencies: Channel config (`guild-channels`), feature flags,
 * `channelGuard` to clean up broken paths, `updateGuildPaths` to persist 
 * messages/IDs, and `openTicket` to create the actual channel.
 *
 * Key Invariants:
 * - A single ticket message per guild (`channels.ticketMessageId`), with 
 *   prefixed customId `tickets:*` for backward compatibility.
 * - Components are only rendered if the `Tickets` feature is enabled.
 * - Saved IDs are cleared if the channel disappears; no infinite retries.
 *
 * Gotchas: The selector is recreated if the message is missing or the bot 
 * finds obsolete prompts; if prefixes/customIds change, handlers (`components/*`) 
 * stop matching. Does not assume high perms: listing/deletion failures stay 
 * logged but do not abort boot.
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
    label: "Report",
    description: "Report bad behavior from other users.",
    emoji: "\u2757",
  },
  {
    id: "featured",
    label: "Featured Notice",
    description: "Inquire about or purchase advertisement on the server.",
    emoji: "\uD83D\uDCE3",
  },
  {
    id: "workshop",
    label: "I want to give a Workshop",
    description: "Do you want to host a workshop on the server?",
    emoji: "\uD83C\uDF93",
  },
  {
    id: "alliance",
    label: "Request server alliance",
    description: "Minimum 300 users and must comply with Discord TOS.",
    emoji: "\uD83E\uDD1D",
  },
  {
    id: "general",
    label: "General",
    description: "If none of the options above apply.",
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
 * Ensure a single ticket prompt per guild, recreating or cleaning as needed.
 *
 * Purpose: Idempotize the main ticket system message so commands/listeners 
 * don't duplicate prompts or end up with broken references.
 *
 * Parameters: Seyfert `client` with access to guilds/messages and optional logger.
 * Returns: Best-effort `Promise<void>` (does not throw; logs warnings/errors).
 * Side effects: Reads/writes on Discord (listing/deleting/creating messages) 
 * and DB (`updateGuildPaths` when clearing paths or persisting the new message).
 * Invariants: Respects feature flag `Tickets`; maintains only one message 
 * whose `customId` starts with `tickets:category`; keeps the first valid prompt 
 * and deletes subsequent bot duplicates.
 * Gotchas: If the configured channel disappears or is not text, it is skipped 
 * and logged; `customId` changes require updating registered handlers.
 * Example: Invoked during boot and after `/tickets config` to refresh the prompt.
 */
export async function ensureTicketMessage(client: UsingClient): Promise<void> {
  const guilds = await client.guilds.list();
  const botId = client.me?.id ?? null;

  for (const guildId of guilds.map((g) => g.id)) {
    const ticketsEnabled = await isFeatureEnabled(guildId, Features.Tickets);
    if (!ticketsEnabled) {
      client.logger?.info?.(
        "[tickets] dashboard disabled; message will not be shown",
        {
          guildId,
        },
      );
      continue;
    }

    const channels = await getGuildChannels(guildId);
    const core = channels.core as Record<string, { channelId: string } | null>;
    const ticketChannel = core.tickets;
    const fetched = await fetchStoredChannel(
      client,
      ticketChannel?.channelId,
      () =>
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
      client.logger?.warn?.(
        "[tickets] configured tickets channel is not text.",
        {
          guildId,
          channelId,
        },
      );
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
      // WHY: We keep the first valid prompt to avoid breaking previous references
      // (e.g. logs or open tickets quoting the message); the rest are purged.
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

/**
 * Builds the ticket creation modal for a category.
 *
 * Parameters: `category` (id/label/desc/emoji) used for customId and text.
 * Returns: `Modal` instance with required input `ticket_details`.
 * Side effects: None until `run` is executed; the callback creates the 
 * channel and writes messages.
 * Invariants: customId `${TICKET_MODAL_PREFIX}:{id}` must align with 
 * handlers/filters; input is validated with min/max and is required.
 * Errors: User responses or network failures are returned via `ctx.write` 
 * with `MessageFlags.Ephemeral`.
 */
export function buildTicketModal(category: TicketCategory): Modal {
  return (
    new Modal()
      .setCustomId(`${TICKET_MODAL_PREFIX}:${category.id}`)
      .setTitle(`Ticket: ${category.label}`)
      .addComponents(
        new ActionRow<TextInput>().addComponents(
          new TextInput()
            .setCustomId(TICKET_DETAILS_INPUT_ID)
            .setLabel("Describe your request")
            .setPlaceholder(
              "Include context, links, or evidence you deem necessary.",
            )
            .setRequired(true)
            .setLength({ min: 8, max: 1000 })
            .setStyle(TextInputStyle.Paragraph),
        ),
      )

      /* When the modal is sent -- ticket creation */
      .run(async (ctx) => {
        const content = ctx.getInputValue(TICKET_DETAILS_INPUT_ID, true);
        const guildId = ctx.guildId;
        const userId = ctx.user?.id;

        if (!guildId) {
          await ctx.write({
            content:
              "Could not create the ticket because the server was not detected.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (!userId) {
          await ctx.write({
            content: "We could not identify your user. Please try again.",
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
              "The ticket system is currently disabled by administrators.",
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
              "No ticket category is configured. Please inform an administrator.",
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
              ? "You already have an open ticket. Please close the previous one before creating a new one."
              : "An error occurred while creating your ticket. Please try again in a few seconds.";
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
            "Please add all relevant information to your request while you wait...",
          )
          .setFooter({
            text: `Created by ${ctx.user?.username || "???"}`,
          });

        const reasonEmbed = new Embed()
          .setColor(Colors.info)
          .setTitle("Ticket Reason")
          .setDescription(content);

        const row = new ActionRow<Button>().addComponents(
          new Button()
            .setCustomId(`${TICKET_CLOSE_BUTTON_ID}:${ticketChannelId}`)
            .setLabel("Close Ticket")
            .setStyle(ButtonStyle.Danger), // Discord doesn't support orange buttons; Danger is closest.
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
          content: `✅ Success! Your ticket has been sent: <#${ticketChannelId}>`,
          flags: MessageFlags.Ephemeral,
        });
      })
  );
}

function buildTicketMessagePayload() {
  const embed = new Embed()
    .setColor("Blurple")
    .setTitle("Ticket Management")
    .setDescription(
      [
        "# Choose the type of ticket to open",
        "",
        "Below you can choose the type of ticket you wish to open to speak with administrators.",
      ].join("\n"),
    )
    .setFooter({
      text: `Tickets are NOT for technical support. Use one of the public forums for that.`,
    });

  const menu = new StringSelectMenu()
    .setCustomId(TICKET_SELECT_CUSTOM_ID)
    .setPlaceholder("Select the ticket type")
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
  const base = (username ?? "user").normalize("NFD");
  const sanitized = base
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();

  const suffix = sanitized || "user";
  return `ticket-${suffix}`.slice(0, 100);
}
