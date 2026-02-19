/**
 * Suggest Command.
 *
 * Purpose: Allow users to submit suggestions for the server.
 */
import type { CommandContext, GuildCommandContext, UsingClient } from "seyfert";
import { Command, createStringOption, Declare, Embed, Options } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { UIColors } from "@/modules/ui/design-system";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { CHANNELS_ID } from "@/constants/guild";
import { updateGuildPaths } from "@/db/repositories/guilds";
import { getGuildChannels } from "@/modules/guild-channels";
import { BindDisabled, Features } from "@/modules/features";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { fetchStoredChannel } from "@/utils/channelGuard";

const options = {
  suggest: createStringOption({
    description: "What do you have in mind for the server?",
    min_length: 16,
    required: true,
  }),
};

@HelpDoc({
  command: "suggest",
  category: HelpCategory.Utility,
  description: "Submit a suggestion for the server to be reviewed by moderators",
  usage: "/suggest <suggestion>",
})
@Declare({
  name: "suggest",
  description: "Submit a suggestion for the server",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@Cooldown({
  type: CooldownType.User,
  interval: 5_000 * 60,
  uses: {
    default: 1,
  },
})
@Options(options)
@BindDisabled(Features.Suggest)
export default class SuggestCommand extends Command {
  async run(ctx: GuildCommandContext<typeof options>) {
    const suggestion = ctx.options.suggest?.trim();
    if (!suggestion) {
      await ctx.write({
        content: "You need to write a suggestion before submitting.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        content: "This command only works in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const suggestChannelId = await resolveSuggestChannel(ctx.client, guildId);
    if (!suggestChannelId) {
      await ctx.write({
        content:
          "No suggestion channel configured. An administrator can set one up in the panel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const suggestEmbed = new Embed({
      title: "New Suggestion!",
      author: {
        name: ctx.author.username,
        icon_url: ctx.author.avatarURL(),
      },
      description: suggestion,
      color: UIColors.info,
      footer: {
        text: "You can vote for or against this suggestion.",
      },
    });

    const message = await ctx.client.messages.write(suggestChannelId, {
      embeds: [suggestEmbed],
    });

    await message.react("✅");
    await message.react("❌");

    try {
      const thread = await ctx.client.messages.thread(
        message.channelId,
        message.id,
        {
          name: `Suggestion by ${ctx.author.username}`,
        },
      );

      await ctx.client.messages.write(thread.id, {
        content: `<@${ctx.member?.user.id}>`,
      });

      await ctx.write({
        content: "✅ Suggestion sent successfully.",
      });
    } catch (error) {
      console.error("[Suggest] Error creating suggestion thread:", error);
      await ctx.editOrReply({
        content: "⚠️ There was a problem creating the suggestion thread.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  onMiddlewaresError(context: CommandContext, error: string) {
    context.editOrReply({ content: error });
  }
}

async function resolveSuggestChannel(
  client: UsingClient,
  guildId: string,
): Promise<string | null> {
  const channels = await getGuildChannels(guildId);
  const core = channels.core as Record<
    string,
    { channelId: string } | null | undefined
  >;
  const managed = channels.managed as Record<
    string,
    { channelId: string } | null | undefined
  >;
  const coreChannelId = core?.suggestions?.channelId ?? null;
  if (coreChannelId) {
    const fetched = await fetchStoredChannel(client, coreChannelId, () =>
      updateGuildPaths(guildId, {
        "channels.core.suggestions": null,
      }),
    );
    if (fetched.channel && fetched.channelId) {
      if (!fetched.channel.isTextGuild()) {
        return null;
      }
      return fetched.channelId;
    }
    if (!fetched.missing) {
      return null;
    }
  }

  const managedChannelId = managed?.suggestions?.channelId ?? null;
  if (managedChannelId) {
    const fetched = await fetchStoredChannel(client, managedChannelId, () =>
      updateGuildPaths(
        guildId,
        {},
        { unset: ["channels.managed.suggestions"] },
      ),
    );
    if (fetched.channel && fetched.channelId) {
      if (!fetched.channel.isTextGuild()) {
        return null;
      }
      return fetched.channelId;
    }
    if (!fetched.missing) {
      return null;
    }
  }

  return CHANNELS_ID.suggestions ?? null;
}
