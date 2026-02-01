/**
 * Trivia Button Handler (Phase 9c).
 *
 * Purpose: Handle A/B/C/D answer buttons for trivia minigame.
 */
import { ComponentCommand, type ComponentContext, Embed, ActionRow, Button } from "seyfert";
import { MessageFlags, ButtonStyle } from "seyfert/lib/types";
import { EmbedColors } from "seyfert/lib/common";
import { minigameService, DIFFICULTY_CONFIG } from "@/modules/economy/minigames";
import { currencyRegistry } from "@/modules/economy/transactions";


// Map letters to indices
const ANSWER_MAP: Record<string, number> = {
  a: 0,
  b: 1,
  c: 2,
  d: 3,
};

export default class TriviaButtonHandler extends ComponentCommand {
  componentType = "Button" as const;

  filter(ctx: ComponentContext<"Button">) {
    // Handle trivia answer buttons (format: trivia:answer:userId:questionId)
    // or play again buttons (format: trivia:again:userId:timestamp)
    if (!ctx.customId.startsWith("trivia:")) return false;
    const parts = ctx.customId.split(":");
    return parts.length === 4;
  }

  async run(ctx: ComponentContext<"Button">) {
    const parts = ctx.customId.split(":");
    if (parts.length !== 4) return;

    const [, action, expectedUserId] = parts;
    const actualUserId = ctx.interaction.user.id;
    const guildId = ctx.guildId;

    // Handle "play again" button
    if (action === "again") {
      await this.handlePlayAgain(ctx, actualUserId, expectedUserId, guildId);
      return;
    }

    // Handle answer buttons (a, b, c, d)
    const questionId = parts[3];
    const answer = action;

    // Security: Verify the user clicking is the same who started
    if (actualUserId !== expectedUserId) {
      await ctx.write({
        content: "❌ No puedes responder por otra persona.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!guildId) {
      await ctx.write({
        content: "❌ Este comando solo funciona en servidores.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if user has active session
    const session = await minigameService.getTriviaSession(actualUserId, guildId);
    if (!session || session.questionId !== questionId) {
      await ctx.write({
        content: "❌ Esta pregunta ya no está activa. Usa `/trivia` para empezar una nueva.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check timeout
    if (new Date() > session.expiresAt) {
      minigameService.clearTriviaSession(actualUserId, guildId);
      await ctx.deferUpdate();
      await ctx.editOrReply({
        content: "⏰ ¡Se acabó el tiempo! La pregunta expiró.",
        components: [],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const answerIndex = ANSWER_MAP[answer.toLowerCase()];
    if (answerIndex === undefined) {
      await ctx.write({
        content: "❌ Respuesta inválida.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Defer update to show loading
    await ctx.deferUpdate();

    // Submit answer
    const result = await minigameService.answerTrivia({
      guildId,
      userId: actualUserId,
      questionId,
      answerIndex,
    });

    if (result.isErr()) {
      const error = result.error;
      const messages: Record<string, string> = {
        COOLDOWN_ACTIVE: "⏳ Espera antes de jugar de nuevo.",
        DAILY_LIMIT_REACHED: "📅 Has alcanzado el límite diario de trivia.",
        CONFIG_NOT_FOUND: "⚙️ Trivia no está disponible.",
        INVALID_CHOICE: "❌ Respuesta inválida.",
        UPDATE_FAILED: "⚠️ Error al procesar tu respuesta.",
        FEATURE_DISABLED: "🚫 Trivia está deshabilitado en este servidor.",
        TIMEOUT_EXPIRED: "⏰ ¡Se acabó el tiempo! La pregunta expiró.",
      };

      await ctx.editOrReply({
        content: messages[error.code] ?? `❌ ${error.message}`,
        components: [],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const game = result.unwrap();
    const currencyObj = currencyRegistry.get("coin");
    const display = (n: number) =>
      currencyObj?.display(n as any) ?? `${n} coins`;

    // Build result embed
    const difficultyConfig = DIFFICULTY_CONFIG[game.difficulty];
    const embed = new Embed();

    if (game.correct) {
      embed
        .setColor(EmbedColors.Green)
        .setTitle("✅ ¡Correcto!")
        .setDescription(
          `**${game.question}**\n\n` +
          `✅ Tu respuesta: **${game.selectedAnswer}**\n` +
          `📝 Respuesta correcta: **${game.correctAnswer}**\n\n` +
          `💡 **Explicación:** ${game.explanation}`
        );

      // Add reward breakdown
      const rewards = game.rewards;
      embed.addFields(
        {
          name: "🎁 Recompensas",
          value: `
Base: ${display(rewards.base.currency)} | ${rewards.base.xp} XP
Dificultad (${difficultyConfig.emoji} x${difficultyConfig.currencyMultiplier}): +${display(rewards.difficulty.currency)} | +${rewards.difficulty.xp} XP
Racha (${game.streakAfter}🔥): +${display(rewards.streak.currency)} | +${rewards.streak.xp} XP
**Total: ${display(rewards.total.currency)} | ${rewards.total.xp} XP**`,
        }
      );

      if (game.streakAfter > 1) {
        embed.setFooter({ text: `🔥 Racha: ${game.streakAfter} | Nuevo balance: ${display(game.newBalance)}` });
      } else {
        embed.setFooter({ text: `Nuevo balance: ${display(game.newBalance)}` });
      }
    } else {
      embed
        .setColor(EmbedColors.Red)
        .setTitle("❌ ¡Incorrecto!")
        .setDescription(
          `**${game.question}**\n\n` +
          `❌ Tu respuesta: **${game.selectedAnswer}**\n` +
          `✅ Respuesta correcta: **${game.correctAnswer}**\n\n` +
          `💡 **Explicación:** ${game.explanation}\n\n` +
          `_Tu racha se ha reiniciado_ 🔥➡️0`
        )
        .setFooter({ text: `Mejor suerte en la siguiente pregunta` });
    }

    // Add "Jugar de nuevo" button
    const row = new ActionRow<Button>().addComponents(
      new Button({
        custom_id: `trivia:again:${actualUserId}:${Date.now()}`,
        label: "🎮 Jugar de nuevo",
        style: ButtonStyle.Success,
      })
    );

    await ctx.editOrReply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  }

  private async handlePlayAgain(
    ctx: ComponentContext<"Button">,
    actualUserId: string,
    expectedUserId: string,
    guildId: string | undefined,
  ) {
    // Security: Verify the user clicking is the same who started
    if (actualUserId !== expectedUserId) {
      await ctx.write({
        content: "❌ No puedes jugar por otra persona.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!guildId) {
      await ctx.write({
        content: "❌ Este comando solo funciona en servidores.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await ctx.deferUpdate();

    // Start new trivia
    const result = await minigameService.startTrivia(guildId, actualUserId);

    if (result.isErr()) {
      const error = result.error;
      const messages: Record<string, string> = {
        COOLDOWN_ACTIVE: "⏳ Espera antes de jugar de nuevo.",
        DAILY_LIMIT_REACHED: "📅 Has alcanzado el límite diario de trivia.",
        CONFIG_NOT_FOUND: "⚙️ Trivia no está disponible.",
        UPDATE_FAILED: "⚠️ Error al iniciar trivia.",
        FEATURE_DISABLED: "🚫 Trivia está deshabilitado en este servidor.",
      };

      await ctx.editOrReply({
        content: messages[error.code] ?? `❌ ${error.message}`,
        components: [],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { question, correlationId, streak, expiresAt } = result.unwrap();
    const difficultyConfig = DIFFICULTY_CONFIG[question.difficulty];
    const timeRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);

    const embed = new Embed()
      .setColor(difficultyConfig.color)
      .setTitle(`${difficultyConfig.emoji} Trivia - ${difficultyConfig.name}`)
      .setDescription(
        `**Categoría:** ${question.category}\n` +
        `**Pregunta:** ${question.question}\n\n` +
        `${question.options.map((opt, i) => `${["A", "B", "C", "D"][i]}) ${opt}`).join("\n")}\n\n` +
        `⏱️ Tiempo restante: ${timeRemaining}s`
      )
      .setFooter({ 
        text: `Racha actual: ${streak} | ID: ${correlationId.slice(-8)}` 
      });

    // Create button row with answer options
    const row1 = new ActionRow<Button>().addComponents(
      new Button({
        custom_id: `trivia:a:${actualUserId}:${question.id}`,
        label: "A",
        style: ButtonStyle.Primary,
        emoji: { name: "🇦" },
      }),
      new Button({
        custom_id: `trivia:b:${actualUserId}:${question.id}`,
        label: "B",
        style: ButtonStyle.Primary,
        emoji: { name: "🇧" },
      }),
    );

    const row2 = new ActionRow<Button>().addComponents(
      new Button({
        custom_id: `trivia:c:${actualUserId}:${question.id}`,
        label: "C",
        style: ButtonStyle.Primary,
        emoji: { name: "🇨" },
      }),
      new Button({
        custom_id: `trivia:d:${actualUserId}:${question.id}`,
        label: "D",
        style: ButtonStyle.Primary,
        emoji: { name: "🇩" },
      }),
    );

    await ctx.editOrReply({
      embeds: [embed],
      components: [row1, row2],
      flags: MessageFlags.Ephemeral,
    });
  }
}
