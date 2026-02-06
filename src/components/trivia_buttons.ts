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
        content: "❌ You cannot answer for another user.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!guildId) {
      await ctx.write({
        content: "❌ This command only works in servers.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if user has active session
    const session = await minigameService.getTriviaSession(actualUserId, guildId);
    if (!session || session.questionId !== questionId) {
      await ctx.write({
        content: "❌ This question is no longer active. Use `/trivia` to start a new one.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check timeout
    if (new Date() > session.expiresAt) {
      minigameService.clearTriviaSession(actualUserId, guildId);
      await ctx.deferUpdate();
      await ctx.editOrReply({
        content: "⏰ Time is up! The question expired.",
        components: [],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const answerIndex = ANSWER_MAP[answer.toLowerCase()];
    if (answerIndex === undefined) {
      await ctx.write({
        content: "❌ Invalid answer.",
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
        COOLDOWN_ACTIVE: "⏳ Wait before playing again.",
        DAILY_LIMIT_REACHED: "📅 You reached the daily trivia limit.",
        CONFIG_NOT_FOUND: "⚙️ Trivia is not available.",
        INVALID_CHOICE: "❌ Invalid answer.",
        UPDATE_FAILED: "⚠️ Error while processing your answer.",
        FEATURE_DISABLED: "🚫 Trivia is disabled in this server.",
        TIMEOUT_EXPIRED: "⏰ Time is up! The question expired.",
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
        .setTitle("✅ Correct!")
        .setDescription(
          `**${game.question}**\n\n` +
          `✅ Your answer: **${game.selectedAnswer}**\n` +
          `📝 Correct answer: **${game.correctAnswer}**\n\n` +
          `💡 **Explanation:** ${game.explanation}`
        );

      // Add reward breakdown
      const rewards = game.rewards;
      embed.addFields(
        {
          name: "🎁 Rewards",
          value: `
Base: ${display(rewards.base.currency)} | ${rewards.base.xp} XP
Difficulty (${difficultyConfig.emoji} x${difficultyConfig.currencyMultiplier}): +${display(rewards.difficulty.currency)} | +${rewards.difficulty.xp} XP
Streak (${game.streakAfter}🔥): +${display(rewards.streak.currency)} | +${rewards.streak.xp} XP
**Total: ${display(rewards.total.currency)} | ${rewards.total.xp} XP**`,
        }
      );

      if (game.streakAfter > 1) {
        embed.setFooter({ text: `🔥 Streak: ${game.streakAfter} | New balance: ${display(game.newBalance)}` });
      } else {
        embed.setFooter({ text: `New balance: ${display(game.newBalance)}` });
      }
    } else {
      embed
        .setColor(EmbedColors.Red)
        .setTitle("❌ Incorrect!")
        .setDescription(
          `**${game.question}**\n\n` +
          `❌ Your answer: **${game.selectedAnswer}**\n` +
          `✅ Correct answer: **${game.correctAnswer}**\n\n` +
          `💡 **Explanation:** ${game.explanation}\n\n` +
          `_Your streak has been reset_ 🔥➡️0`
        )
        .setFooter({ text: "Better luck on the next question." });
    }

    // Add "Play again" button
    const row = new ActionRow<Button>().addComponents(
      new Button({
        custom_id: `trivia:again:${actualUserId}:${Date.now()}`,
        label: "🎮 Play again",
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
        content: "❌ You cannot play for another user.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!guildId) {
      await ctx.write({
        content: "❌ This command only works in servers.",
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
        COOLDOWN_ACTIVE: "⏳ Wait before playing again.",
        DAILY_LIMIT_REACHED: "📅 You reached the daily trivia limit.",
        CONFIG_NOT_FOUND: "⚙️ Trivia is not available.",
        UPDATE_FAILED: "⚠️ Error while starting trivia.",
        FEATURE_DISABLED: "🚫 Trivia is disabled in this server.",
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
        `**Category:** ${question.category}\n` +
        `**Question:** ${question.question}\n\n` +
        `${question.options.map((opt, i) => `${["A", "B", "C", "D"][i]}) ${opt}`).join("\n")}\n\n` +
        `⏱️ Time remaining: ${timeRemaining}s`
      )
      .setFooter({ 
        text: `Current streak: ${streak} | ID: ${correlationId.slice(-8)}` 
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
