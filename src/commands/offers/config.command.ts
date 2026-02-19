/**
 * Offers Channel Configuration.
 *
 * This command updates `channels.core` via `configStore`:
 * - `offersReview`: channel where offers are sent for review (required).
 * - `approvedOffers`: channel where approved offers are published (optional but recommended).
 */
import "./config";

import { HelpDoc, HelpCategory } from "@/modules/help";
import {
  createChannelOption,
  Declare,
  Options,
  SubCommand,
  type GuildCommandContext,
} from "seyfert";
import { ChannelType, MessageFlags } from "seyfert/lib/types";

import { GuildStore } from "@/db/repositories/guilds";
import { configStore, ConfigurableModule } from "@/configuration";
import { ensureGuildContext } from "./shared";

const options = {
  revision: createChannelOption({
    description: "Channel where offers will be sent for review",
    required: true,
    channel_types: [ChannelType.GuildText],
  }),
  approved: createChannelOption({
    description: "Channel where approved offers will be published",
    required: true,
    channel_types: [ChannelType.GuildText],
  }),
};

@HelpDoc({
  command: "offer config",
  category: HelpCategory.Offers,
  description: "Configure the offers system channels for review and publishing",
  usage: "/offer config [review_channel] [approved_channel]",
  permissions: ["ManageChannels"],
})
@Declare({
  name: "config",
  description: "Configure the offers system",
  defaultMemberPermissions: ["ManageChannels"],
})
@Options(options)
export default class OfferConfigCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = await ensureGuildContext(ctx);
    if (!guildId) return;

    const { revision, approved } = ctx.options;

    // Ensure guild document to persist `channels.core`.
    await GuildStore.ensure(guildId);

    await configStore.set(guildId, ConfigurableModule.Offers, {
      offersReview: { channelId: revision.id },
      approvedOffers: { channelId: approved.id },
    });

    await ctx.write({
      content: [
        "Offers configuration saved:",
        `- Review: <#${revision.id}>`,
        `- Approved: <#${approved.id}>`,
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
    });
  }
}
