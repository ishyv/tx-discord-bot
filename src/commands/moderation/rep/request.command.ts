import {
  createStringOption,
  Declare,
  GuildCommandContext,
  Options,
  SubCommand,
  Middlewares,
} from "seyfert";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { updateGuildPaths } from "@/db/repositories/guilds";
import { getCoreChannel } from "@/modules/guild-channels";
import { CoreChannelNames } from "@/modules/guild-channels/constants";
import { fetchStoredChannel } from "@/utils/channelGuard";
import { sendReputationRequest } from "./shared";
import { Guard } from "@/middlewares/guards/decorator";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { Features } from "@/modules/features";

const options = {
  message_link: createStringOption({
    description: "Link to the message for which you are requesting reputation",
    required: true,
  }),
};

/**
 * Slash subcommand that lets any guild user raise a reputation review request.
 * - Validates that the reputation system is enabled and that a repRequests channel is configured.
 * - Forwards the request to that channel with staff buttons (aceptar/set/rechazar/cerrar/penalizar).
 * - Enforces a per-user cooldown (5m base) to avoid spam.
 */
@HelpDoc({
  command: "rep request",
  category: HelpCategory.Moderation,
  description: "Request a reputation review from staff with a reason",
  usage: "/rep request <reason>",
  notes: "Has a cooldown to prevent spam.",
})
@Declare({
  name: "request",
  description: "Request a reputation review from the staff",
})
@Options(options)
@Guard({
  guildOnly: true,
  feature: Features.Reputation,
})
@Middlewares(["guard"])
@Cooldown({
  type: CooldownType.User,
  interval: 300_000, // 5 minutes
  uses: { default: 1 },
})
export default class RepRequestCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    // Ack early to avoid timeouts when channel fetches or writes are slow.
    await ctx.deferReply(true);

    const repChannelConfig = await getCoreChannel(
      guildId,
      CoreChannelNames.RepRequests,
    );
    const fetched = await fetchStoredChannel(
      ctx.client,
      repChannelConfig?.channelId,
      () =>
        updateGuildPaths(guildId, {
          "channels.core.repRequests": null,
        }),
    );

    const repChannel = fetched.channel;
    if (!fetched.channelId || !repChannel) {
      await ctx.editResponse({
        content:
          "Reputation requests are not configured in this server.",
      });
      return;
    }

    if (!repChannel.isTextGuild()) {
      await ctx.editResponse({
        content:
          "The reputation request channel is not valid or is not a text channel.",
      });
      return;
    }

    const { message_link } = ctx.options;

    const linkMatch = message_link.match(
      /^https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)$/,
    );

    if (!linkMatch) {
      await ctx.editResponse({
        content:
          "The provided link is not valid. Use the direct link to the message.",
      });
      return;
    }

    const [, guildIdFromLink, channelIdFromLink, messageIdFromLink] = linkMatch;

    if (guildIdFromLink !== guildId) {
      await ctx.editResponse({
        content: "The link does not belong to this server.",
      });
      return;
    }

    const targetChannel = await ctx.client.channels.fetch(channelIdFromLink);
    if (!targetChannel || !targetChannel.isTextGuild()) {
      await ctx.editResponse({
        content: "Could not access the channel of the provided message.",
      });
      return;
    }

    try {
      const targetMessage =
        await targetChannel.messages.fetch(messageIdFromLink);
      await sendReputationRequest(repChannel, targetMessage, ctx.author);

      await ctx.editResponse({
        content:
          "Your reputation request has been sent to the moderation team.",
      });
    } catch (error) {
      await ctx.editResponse({
        content:
          "Could not find the message or I don't have permission to read it.",
      });
    }
  }
}
