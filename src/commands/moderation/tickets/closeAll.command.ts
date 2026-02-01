/**
 * Ticket Close All Command.
 *
 * Purpose: Forcefully close and delete all active ticket channels in the guild.
 */
import {
  Declare,
  type GuildCommandContext,
  SubCommand,
  Middlewares,
} from "seyfert";

import { GuildStore } from "@/db/repositories/guilds";
import { closeTicket } from "@/systems/tickets/shared";
import { Guard } from "@/middlewares/guards/decorator";

@Declare({
  name: "close-all",
  description: "Close all open tickets in the server",
  contexts: ["Guild"],
})
@Guard({
  guildOnly: true,
  permissions: ["ManageChannels"],
})
@Middlewares(["guard"])
export default class ConfigTicketsCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const guildId = ctx.guildId;

    // Ensure guild row exists
    const res = await GuildStore.ensure(guildId);

    // Fetch all pending tickets
    const guild = res.unwrap();
    const pendingTickets = (guild?.pendingTickets ?? []) as string[];

    // TODO: Generate transcript before closing

    // Close each ticket channel
    for (const ticketChannelId of pendingTickets) {
      let channelDeleted = false;
      try {
        const channel = await ctx.client.channels.fetch(ticketChannelId);
        if (!channel) {
          channelDeleted = true;
        } else {
          await ctx.client.channels.delete(channel.id);
          channelDeleted = true;
        }
      } catch (error) {
        const code =
          typeof error === "object" &&
            error &&
            "code" in (error as Record<string, unknown>)
            ? Number((error as { code?: number }).code)
            : undefined;

        if (code === 10003) {
          channelDeleted = true; // channel already removed
        } else {
          ctx.client.logger?.error?.(
            "[tickets] failed to close ticket channel",
            {
              error,
              ticketChannelId,
            },
          );
        }
      }

      if (channelDeleted) {
        await closeTicket(guildId, ticketChannelId);
      }
    }

    await ctx.write({
      content: "All open tickets have been closed.",
    });
  }
}
