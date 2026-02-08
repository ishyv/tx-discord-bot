/**
 * Ticket Close All Command.
 *
 * Purpose: Forcefully close and delete all active ticket channels in the guild.
 */
import {
  AttachmentBuilder,
  Declare,
  type GuildCommandContext,
  SubCommand,
  Middlewares,
} from "seyfert";

import { GuildStore, updateGuildPaths } from "@/db/repositories/guilds";
import { getGuildChannels } from "@/modules/guild-channels";
import { closeTicket } from "@/systems/tickets/shared";
import { create_transcription } from "@/systems/tickets/transcription";
import { fetchStoredChannel } from "@/utils/channelGuard";
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

    const guildChannels = await getGuildChannels(guildId).catch(() => null);
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

    await Promise.all(
      pendingTickets.map(async (ticketChannelId) => {
        let channelDeleted = false;
        try {
          const channel = await ctx.client.channels.fetch(ticketChannelId);
          if (!channel) {
            channelDeleted = true;
          } else {
            if (logsChannel) {
              try {
                const transcriptBuffer = await create_transcription(
                  ctx.client,
                  ticketChannelId,
                );
                const transcriptAttachment = new AttachmentBuilder()
                  .setName("transcript.html")
                  .setDescription("Ticket transcript")
                  .setFile("buffer", transcriptBuffer);

                await logsChannel.messages.write({
                  content: `Ticket transcript: ${"name" in channel ? channel.name : "Unknown"}`,
                  files: [transcriptAttachment],
                });
              } catch (error) {
                ctx.client.logger?.error?.(
                  "[tickets] failed to generate or send transcript",
                  {
                    error,
                    guildId,
                    ticketChannelId,
                  },
                );
              }
            }

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
      }),
    );

    await ctx.write({
      content: "All open tickets have been closed.",
    });
  }
}
