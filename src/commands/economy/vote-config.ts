/**
 * Vote Config Command.
 *
 * Purpose: Configure voting preferences and opt-out.
 */
import {
  Command,
  Declare,
  Options,
  type GuildCommandContext,
  createBooleanOption,
  Embed,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { EmbedColors } from "seyfert/lib/common";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
  votingService,
  votingRepo,
  formatVoteCounts,
  calculateLoveRatio,
  VOTE_BADGES,
} from "@/modules/economy/voting";

const configOptions = {
  opt_out: createBooleanOption({
    description: "Desactivar recibir votos (true = no recibir votos)",
    required: false,
  }),
  show: createBooleanOption({
    description: "Mostrar tus estadísticas en perfil público",
    required: false,
  }),
};

@Declare({
  name: "vote-config",
  description: "Configura tus preferencias de votación",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 3000,
  uses: { default: 1 },
})
@Options(configOptions)
export default class VoteConfigCommand extends Command {
  async run(ctx: GuildCommandContext<typeof configOptions>) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;
    const optOut = ctx.options.opt_out;
    const show = ctx.options.show;

    if (!guildId) {
      await ctx.write({
        content: "❌ Este comando solo funciona en servidores.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Handle opt-out toggle
    if (optOut !== undefined) {
      const result = await votingService.updateUserPrefs(userId, { optOut });
      if (result.isErr()) {
        await ctx.write({
          content: "❌ Error al actualizar preferencias.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await ctx.write({
        content: optOut
          ? "🚫 Ahora no recibes votos."
          : "✅ Ahora puedes recibir votos.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Handle show toggle
    if (show !== undefined) {
      const result = await votingService.updateUserPrefs(userId, {
        showVotes: show,
      });
      if (result.isErr()) {
        await ctx.write({
          content: "❌ Error al actualizar preferencias.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await ctx.write({
        content: show
          ? "✅ Tus estadísticas se mostrarán en tu perfil."
          : "🚫 Tus estadísticas no se mostrarán públicamente.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Show current status (no options provided)
    const [prefsResult, statsResult, badgesResult, configResult] =
      await Promise.all([
        votingService.getUserPrefs(userId),
        votingService.getUserStats(guildId, userId),
        votingService.getUserBadges(guildId, userId),
        votingRepo.getConfig(guildId),
      ]);

    const prefs = prefsResult.unwrap();
    const stats = statsResult.unwrap();
    const badges = badgesResult.unwrap();
    const config = configResult.unwrap();

    const embed = new Embed()
      .setColor(EmbedColors.Blue)
      .setTitle("⚙️ Configuración de Votos")
      .setDescription(
        `**Estado:** ${prefs.optOut ? "🚫 Opt-out" : "✅ Activo"}\n` +
          `**Mostrar en perfil:** ${prefs.showVotes ? "✅ Sí" : "🚫 No"}\n` +
          `**Votos hoy:** ${stats.dailyVoteCount}/${config.dailyMaxVotes}\n\n` +
          `**Tus estadísticas:**\n${formatVoteCounts(stats.loveCount, stats.hateCount)}\n` +
          `Ratio: ${calculateLoveRatio(stats.loveCount, stats.hateCount)}% 💝`,
      );

    if (badges.length > 0) {
      embed.addFields({
        name: "🏅 Insignias Desbloqueadas",
        value: badges
          .map((b) => `${b.emoji} **${b.name}**: ${b.description}`)
          .join("\n"),
        inline: false,
      });
    } else {
      embed.addFields({
        name: "🏅 Insignias",
        value: "Aún no tienes insignias. ¡Recibe votos para desbloquearlas!",
        inline: false,
      });
    }

    // Show next badge targets
    const earnedIds = new Set(badges.map((b) => b.id));
    const nextBadges = VOTE_BADGES.filter((b) => !earnedIds.has(b.id)).slice(
      0,
      3,
    );

    if (nextBadges.length > 0) {
      embed.addFields({
        name: "🎯 Próximas Insignias",
        value: nextBadges
          .map((b) => `${b.emoji} ${b.name}: ${b.description}`)
          .join("\n"),
        inline: false,
      });
    }

    embed.setFooter({
      text: "Usa /vote-config opt-out:true/false para cambiar tu configuración",
    });

    await ctx.write({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }
}
