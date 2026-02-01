/**
 * Ticket service (domain): Orchestrates channel+persistence+limits in a single API.
 *
 * Context: Used by UI (components/commands) and systems to create/close
 * tickets without duplicating Mongo logic or channel handling.
 * Key Dependencies: `user-tickets` and `guilds` repos for consistency, Discord 
 * channel API via Seyfert, and `Result` for no-throw policy.
 * Invariants: Maximum `maxPerUser` open tickets per author/guild; if 
 * persistence fails, the created channel is reverted; `pendingTickets` is 
 * always treated as an array of unique strings.
 * Gotchas: Order matters (create channel -> persist -> update guild);
 * if indexes or `pendingTickets` shape change, adjust pipelines.
 */
import type { UsingClient } from "seyfert";
import { ChannelType } from "seyfert/lib/types";
import { updateGuildPaths } from "@/db/repositories/guilds";
import { UserTicketsRepo } from "@/db/repositories/user-tickets";
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

/**
 * Opens a ticket by creating a channel + registering the user with a limit.
 *
 * Parameters: `params` (guildId, userId, parentId, channelName) and `maxPerUser`
 * (hard limit per user). `parentId` must be a valid category.
 * Returns: `Result<{channelId}>`; on error, returns `ErrResult` with cause or
 * `TICKET_LIMIT_REACHED` when limit exceeded.
 * Side effects: Creates Discord channel, writes to `UserTickets` and
 * `pendingTickets` repos in guild; deletes the channel if any subsequent 
 * steps fail to avoid orphans.
 * Invariants: DB write occurs after channel creation; if `addWithLimit`
 * returns false, the channel is reverted. Does not throw; everything is 
 * encapsulated in Result.
 */
export async function openTicket(
  client: UsingClient,
  params: OpenTicketParams,
  maxPerUser = 1,
): Promise<Result<OpenTicketResult>> {
  try {
    // WHY: Channel is created first to get a real ID; if the limit fails,
    // the channel is deleted to leave no orphans.
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
      await UserTicketsRepo.removeOpen(params.userId, channel.id).catch(
        () => null,
      );
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

/**
 * Synchronizes ticket closure in guild + user stores.
 *
 * Purpose: Remove the channel from `pendingTickets` and from `openTickets` of
 * any user referring to it.
 * Returns: `Result<void>`; does not throw.
 * Side effects: Writes in `guilds` via `updateGuildPaths` and in `user-tickets`.
 * Gotchas: Does not validate that the channel exists on Discord; assumes caller 
 * has already closed/deleted it. Uses $setDifference to maintain unique arrays.
 */
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
