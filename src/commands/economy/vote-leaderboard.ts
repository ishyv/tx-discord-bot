/**
 * Vote Leaderboard Command.
 *
 * Purpose: Show top users by love/hate/net votes.
 */
import {
  Command,
  Declare,
  Options,
  type GuildCommandContext,
  createStringOption,
  createIntegerOption,
  Embed,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { EmbedColors } from "seyfert/lib/common";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { votingService } from "@/modules/economy/voting";

const leaderboardOptions = {
  type: createStringOption({
    description: "Tipo de leaderboard",
    required: false,
    choices: [
      { name: "💖 Más Love", value: "love" },
      { name: "😤 Más Hate", value: "hate" },
      { name: "⭐ Mejor Ratio", value: "net" },
    ],
  }),
  limit: createIntegerOption({
    description: "Cantidad de usuarios a mostrar (5-20)",
    required: false,
    min_value: 5,
    max_value: 20,
  }),
};

@Declare({
  name: "vote-leaderboard",
  description: "Ver ranking de votos del servidor",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 10000,
  uses: { default: 1 },
})
@Options(leaderboardOptions)
export default class VoteLeaderboardCommand extends Command {
  async run(ctx: GuildCommandContext<typeof leaderboardOptions>) {
    const guildId = ctx.guildId;

    if (!guildId) {
      await ctx.write({
        content: "❌ Este comando solo funciona en servidores.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const type = (ctx.options.type ?? "love") as "love" | "hate" | "net";
    const limit = ctx.options.limit ?? 10;

    const result = await votingService.getLeaderboard(guildId, type, limit);

    if (result.isErr()) {
      await ctx.write({
        content: "❌ Error al cargar el leaderboard.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const leaderboard = result.unwrap();

    if (leaderboard.length === 0) {
      await ctx.write({
        content: "📊 Aún no hay votos registrados en este servidor.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const titleMap = {
      love: "💖 Top Love Recibidos",
      hate: "😤 Top Hate Recibidos",
      net: "⭐ Mejor Ratio (Love - Hate)",
    };

    const emojiMap = {
      love: "💖",
      hate: "😤",
      net: "⭐",
    };

    const description = leaderboard
      .map((entry, index) => {
        const medal =
          index === 0
            ? "🥇"
            : index === 1
              ? "🥈"
              : index === 2
                ? "🥉"
                : `${index + 1}.`;
        return `${medal} <@${entry.userId}>: ${emojiMap[type]} ${entry.score}`;
      })
      .join("\n");

    const embed = new Embed()
      .setColor(
        type === "love"
          ? EmbedColors.Green
          : type === "hate"
            ? EmbedColors.Red
            : EmbedColors.Gold,
      )
      .setTitle(titleMap[type])
      .setDescription(description)
      .setFooter({ text: `Mostrando top ${leaderboard.length}` });

    await ctx.write({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }
}
