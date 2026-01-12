/**
 * Ticket service: single entrypoint to open/close tickets using the DB layer.
 * Purpose: centralize limit checks, channel creation, and state synchronization
 * so commands/listeners do not duplicate DB writes or race on open tickets.
 */
import type { UsingClient } from "seyfert";
import { ChannelType } from "seyfert/lib/types";
import { UserTicketsRepo } from "@/db/repositories/user-tickets";
import { updateGuildPaths } from "@/db/repositories/guilds";
import { ErrResult, OkResult, type Result } from "@/utils/result";

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
    const channel = await client.guilds.channels.create(params.guildId, {
      name: params.channelName,
      type: ChannelType.GuildText,
      parent_id: params.parentId,
    });

    const added = await UserTicketsRepo.addWithLimit(
      params.userId,
      channel.id,
      maxPerUser,
    );
    if (added.isErr()) {
      await client.channels.delete(channel.id).catch(() => null);
      return ErrResult(added.error);
    }

    if (!added.unwrap()) {
      await client.channels.delete(channel.id).catch(() => null);
      return ErrResult(new Error("TICKET_LIMIT_REACHED"));
    }

    try {
      await updateGuildPaths(params.guildId, {
        pendingTickets: {
          $setUnion: [
            {
              $cond: [{ $isArray: "$pendingTickets" }, "$pendingTickets", []],
            },
            [channel.id],
          ],
        },
      });
    } catch (error) {
      await UserTicketsRepo.removeOpen(params.userId, channel.id).catch(() => null);
      await client.channels.delete(channel.id).catch(() => null);
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }

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
    await updateGuildPaths(guildId, {
      pendingTickets: {
        $setDifference: [
          {
            $cond: [{ $isArray: "$pendingTickets" }, "$pendingTickets", []],
          },
          [channelId],
        ],
      },
    });
    await UserTicketsRepo.removeByChannel(channelId);
    return OkResult(undefined);
  } catch (error) {
    return ErrResult(error instanceof Error ? error : new Error(String(error)));
  }
}
