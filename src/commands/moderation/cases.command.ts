import {
  Command,
  Declare,
  Options,
  Embed,
  createUserOption,
  type GuildCommandContext,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { UIColors } from "@/modules/ui/design-system";
import { UserStore } from "@/db/repositories/users";
import { SanctionType } from "@/db/schemas/user";
import { safeModerationRun } from "@/modules/moderation/executeSanction";
import { HelpDoc, HelpCategory } from "@/modules/help";

const options = {
  user: createUserOption({
    description: "User to view the case history for",
    required: false,
  }),
};

@HelpDoc({
  command: "cases",
  category: HelpCategory.Moderation,
  description: "View the sanction history (cases) of a user on this server",
  usage: "/cases [user]",
})
@Declare({
  name: "cases",
  description:
    "View the sanction history of a user on this server",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@Options(options)
export default class CasesCommand extends Command {
  async run(ctx: GuildCommandContext<typeof options>) {
    await safeModerationRun(ctx, () => this.execute(ctx));
  }

  private async execute(ctx: GuildCommandContext<typeof options>) {
    const userOption = ctx.options.user;
    const targetId = userOption ? userOption.id : ctx.author.id;
    const targetName = userOption ? userOption.username : ctx.author.username;

    const targetAvatar = userOption
      ? await userOption.avatarURL()
      : ctx.author.avatarURL();

    const userResult = await UserStore.get(targetId);

    if (userResult.isErr()) {
      await ctx.editOrReply({
        flags: MessageFlags.Ephemeral,
        content: "There was an error fetching user history.",
      });
      return;
    }

    const userData = userResult.unwrap();
    if (!userData) {
      await ctx.editOrReply({
        flags: MessageFlags.Ephemeral,
        content: "No records found for this user in the database.",
      });
      return;
    }

    const guildId = ctx.guildId!;
    const history = userData.sanction_history?.[guildId] ?? [];

    if (history.length === 0) {
      await ctx.editOrReply({
        flags: MessageFlags.Ephemeral,
        content: `User **${targetName}** has no cases recorded on this server.`,
      });
      return;
    }

    // Sort by date descending (most recent first)
    const sortedHistory = [...history].reverse().slice(0, 15);

    const description = sortedHistory
      .map((entry, index) => {
        const typeEmoji = this.getEmojiForType(entry.type);
        const date = entry.date
          ? `<t:${Math.floor(new Date(entry.date).getTime() / 1000)}:d>`
          : "N/A";
        return `**${index + 1}.** ${typeEmoji} **${entry.type}** — ${date}\n> ${entry.description}`;
      })
      .join("\n\n");

    const embed = new Embed({
      title: `Case History for ${targetName}`,
      description: description,
      color: UIColors.info,
      footer: {
        text: `Showing last ${sortedHistory.length} cases | ID: ${targetId}`,
        icon_url: targetAvatar,
      },
      timestamp: new Date().toISOString(),
    });

    await ctx.editOrReply({
      flags: MessageFlags.Ephemeral,
      embeds: [embed],
    });
  }

  private getEmojiForType(type: SanctionType): string {
    switch (type) {
      case "BAN":
        return "🔨";
      case "KICK":
        return "👢";
      case "TIMEOUT":
        return "🔇";
      case "WARN":
        return "⚠️";
      case "RESTRICT":
        return "🚫";
      default:
        return "📝";
    }
  }
}
