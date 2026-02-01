/**
 * Ticket Config Command.
 *
 * Purpose: Setup the ticket system channels and category.
 */
import {
  createChannelOption,
  Declare,
  type GuildCommandContext,
  Options,
  SubCommand,
  Middlewares,
} from "seyfert";
import { ChannelType } from "seyfert/lib/types";

import { GuildStore } from "@/db/repositories/guilds";
import { Guard } from "@/middlewares/guards/decorator";
import { ensureTicketMessage } from "@/systems/tickets";

const options = {
  // Ticket channel
  channel: createChannelOption({
    description: "Channel where the ticket message will be sent",
    required: true,
    channel_types: [ChannelType.GuildText],
  }),

  // Category where tickets will be created
  category: createChannelOption({
    description: "Category where tickets will be created",
    required: true,
    channel_types: [ChannelType.GuildCategory],
  }),

  // Ticket logs channel
  logchannel: createChannelOption({
    description: "Channel where ticket logs will be sent",
    required: true,
    channel_types: [ChannelType.GuildText],
  }),
};

@Declare({
  name: "config",
  description: "Configure the ticket system",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
})
@Options(options)
@Guard({
  guildOnly: true,
})
@Middlewares(["guard"])
export default class ConfigTicketsCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const {
      channel: tickets,
      category: ticketCategory,
      logchannel: ticketLogs,
    } = ctx.options;

    const guildId = ctx.guildId;

    // Ensure guild row exists
    await GuildStore.ensure(guildId);

    const { configStore, ConfigurableModule } = await import("@/configuration");

    // Save using the new config store
    // The schema expects { tickets: {channelId: string}, ... }
    await configStore.set(guildId, ConfigurableModule.Tickets, {
      tickets: { channelId: tickets.id },
      ticketCategory: { channelId: ticketCategory.id },
      ticketLogs: { channelId: ticketLogs.id },
    });

    // Debug: read back stored values
    const config = await configStore.get(guildId, ConfigurableModule.Tickets);

    console.log("Data saved in the database:");
    console.log("Ticket channel:", config.tickets);
    console.log("Ticket logs channel:", config.ticketLogs);
    console.log("Ticket category:", config.ticketCategory);

    // When the ticket channel is updated, ensure the ticket message exists.
    await ensureTicketMessage(ctx.client).catch(() => {
      // do nothing if it fails; the message will be attempted to be created on the next restart or reconfiguration
    });

    await ctx.write({
      content: "Ticket configuration saved successfully.",
    });
  }
}
