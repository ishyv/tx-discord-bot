/**
 * Ticket service: single entrypoint to open/close tickets using the DB layer.
 * Purpose: centralize limit checks, channel creation, and state synchronization
 * so commands/listeners do not duplicate DB writes or race on open tickets.
 */
import { type UsingClient } from "seyfert";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { addOpenTicket, listOpenTickets, removeOpenTicketByChannel } from "@/db/repositories";
import { setPendingTickets } from "@/db/repositories/guilds";
import { ChannelType } from "seyfert/lib/types";

export interface OpenTicketParams {
  guildId: string;
  userId: string;
  parentId: string;
  channelName: string;
}

export interface OpenTicketResult {
  channelId: string;
}

export async function openTicket(
  client: UsingClient,
  params: OpenTicketParams,
  maxPerUser = 1,
): Promise<Result<OpenTicketResult>> {
  try {
    const openTickets = await listOpenTickets(params.userId);
    if (openTickets.isErr()) return ErrResult(openTickets.error);
    if (openTickets.unwrap().length >= maxPerUser) {
      return ErrResult(new Error("TICKET_LIMIT_REACHED"));
    }

    const channel = await client.guilds.channels.create(params.guildId, {
      name: params.channelName,
      type: ChannelType.GuildText,
      parent_id: params.parentId,
    });

    // Update state atomically-ish: guild pending + user open tickets.
    await setPendingTickets(params.guildId, (current) => {
      const next = new Set(current ?? []);
      next.add(channel.id);
      return Array.from(next);
    });
    await addOpenTicket(params.userId, channel.id);

    return OkResult({ channelId: channel.id });
  } catch (error) {
    return ErrResult(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function recordTicketClosure(
  guildId: string,
  channelId: string,
): Promise<Result<void>> {
  try {
    await setPendingTickets(guildId, (current) => current.filter((id) => id !== channelId));
    await removeOpenTicketByChannel(channelId);
    return OkResult(undefined);
  } catch (error) {
    return ErrResult(error instanceof Error ? error : new Error(String(error)));
  }
}
