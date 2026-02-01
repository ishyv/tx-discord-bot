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

const options = {
  user: createUserOption({
    description: "User to view the case history for",
    required: false,
  }),
};

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
    const userOption = ctx.options.user;
    const targetId = userOption ? userOption.id : ctx.author.id;
    const targetName = userOption ? userOption.username : ctx.author.username;

    // If user is target, try to get avatarUrl, if not, use ctx.author
    const targetAvatar = userOption
      ? await userOption.avatarURL()
      : ctx.author.avatarURL();

    const userResult = await UserStore.get(targetId);

    if (userResult.isErr()) {
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content: "❌ There was an error fetching user history.",
      });
    }

    const userData = userResult.unwrap();
    if (!userData) {
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content:
          "❌ No records found for this user in the database.",
      });
    }

    const guildId = ctx.guildId!;
    const history = userData.sanction_history?.[guildId] ?? [];

    if (history.length === 0) {
      return ctx.write({
        flags: MessageFlags.Ephemeral,
        content: `📁 User **${targetName}** has no cases recorded on this server.`,
      });
    }

    // Sort by date descending (most recent first)
    const sortedHistory = [...history].reverse().slice(0, 15); // Limit to 15

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

    await ctx.write({
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
      default:
        return "📝";
    }
  }
}
