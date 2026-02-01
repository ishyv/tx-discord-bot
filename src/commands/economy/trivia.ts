/**
 * Trivia Command (Phase 9c).
 *
 * Purpose: Answer trivia questions with button-based answers, streaks, and explanations.
 */
import {
  Command,
  Declare,
  Options,
  type GuildCommandContext,
  createStringOption,
  Embed,
  ActionRow,
  Button,
} from "seyfert";
import { MessageFlags, ButtonStyle } from "seyfert/lib/types";

import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
  minigameService,
  type TriviaQuestion,
  DIFFICULTY_CONFIG,
} from "@/modules/economy/minigames";
import {
  economyAccountRepo,
  createEconomyAccountService,
  guildEconomyRepo,
  buildErrorEmbed,
} from "@/modules/economy";


const triviaOptions = {
  category: createStringOption({
    description: "Trivia category (optional)",
    required: false,
    choices: [
      { name: "Technology", value: "tech" },
      { name: "Video Games", value: "gaming" },
      { name: "Anime", value: "anime" },
      { name: "History", value: "history" },
      { name: "General", value: "general" },
      { name: "Science", value: "science" },
      { name: "Music", value: "music" },
      { name: "Memes", value: "memes" },
      { name: "Programming", value: "programming" },
    ],
  }),
};

@Declare({
  name: "trivia",
  description: "Answer trivia questions and win rewards",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 5000,
  uses: { default: 1 },
})
@Options(triviaOptions)
export default class TriviaCommand extends Command {
  async run(ctx: GuildCommandContext<typeof triviaOptions>) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;

    if (!guildId) {
      await ctx.write({
        embeds: [buildErrorEmbed("This command only works in servers.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check feature flag
    const guildConfigResult = await guildEconomyRepo.ensure(guildId);
    if (
      guildConfigResult.isOk() &&
      !guildConfigResult.unwrap().features.trivia
    ) {
      await ctx.write({
        embeds: [
          buildErrorEmbed("Trivia is disabled on this server."),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check account
    const accountService = createEconomyAccountService(economyAccountRepo);
    const ensureResult = await accountService.ensureAccount(userId);
    if (ensureResult.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed("Could not access your account.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { account } = ensureResult.unwrap();
    if (account.status !== "ok") {
      await ctx.write({
        embeds: [buildErrorEmbed("Your account has restrictions.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if user already has an active session
    const existingSession = await minigameService.getTriviaSession(userId, guildId);
    if (existingSession) {
      // Check if expired
      if (new Date() > existingSession.expiresAt) {
        minigameService.clearTriviaSession(userId, guildId);
      } else {
        // Show existing question
        await this.showExistingQuestion(ctx, existingSession.questionId, existingSession.expiresAt);
        return;
      }
    }

    // Start new trivia
    await this.startTrivia(ctx, guildId, userId);
  }

  private async startTrivia(
    ctx: GuildCommandContext,
    guildId: string,
    userId: string,
  ) {
    const result = await minigameService.startTrivia(guildId, userId);

    if (result.isErr()) {
      const error = result.error;
      const messages: Record<string, string> = {
        COOLDOWN_ACTIVE: "Wait before playing again.",
        DAILY_LIMIT_REACHED: "You have reached the daily trivia limit.",
        CONFIG_NOT_FOUND: "Trivia is not available.",
        UPDATE_FAILED: "Error starting trivia.",
        FEATURE_DISABLED: "Trivia is disabled on this server.",
      };

      await ctx.write({
        embeds: [buildErrorEmbed(messages[error.code] ?? error.message)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { question, correlationId, streak, expiresAt } = result.unwrap();

    // Show question with buttons
    await this.showQuestion(ctx, question, streak, expiresAt, correlationId);
  }

  private async showQuestion(
    ctx: GuildCommandContext,
    question: TriviaQuestion,
    streak: number,
    expiresAt: Date,
    correlationId: string,
  ) {
    const difficultyConfig = DIFFICULTY_CONFIG[question.difficulty];
    const optionsText = question.options
      .map((opt, i) => `${["A", "B", "C", "D"][i]}) ${opt}`)
      .join("\n");

    const timeRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);

    const embed = new Embed()
      .setColor(difficultyConfig.color)
      .setTitle(`${difficultyConfig.emoji} Trivia - ${difficultyConfig.name}`)
      .setDescription(
        `**Category:** ${question.category}\n` +
        `**Question:** ${question.question}\n\n` +
        `${optionsText}\n\n` +
        `⏱️ Time remaining: ${timeRemaining}s`
      )
      .setFooter({
        text: `Current streak: ${streak} | ID: ${correlationId.slice(-8)}`
      });

    // Create button row with answer options
    const row1 = new ActionRow<Button>().addComponents(
      new Button({
        custom_id: `trivia:a:${ctx.author.id}:${question.id}`,
        label: "A",
        style: ButtonStyle.Primary,
        emoji: { name: "🇦" },
      }),
      new Button({
        custom_id: `trivia:b:${ctx.author.id}:${question.id}`,
        label: "B",
        style: ButtonStyle.Primary,
        emoji: { name: "🇧" },
      }),
    );

    const row2 = new ActionRow<Button>().addComponents(
      new Button({
        custom_id: `trivia:c:${ctx.author.id}:${question.id}`,
        label: "C",
        style: ButtonStyle.Primary,
        emoji: { name: "🇨" },
      }),
      new Button({
        custom_id: `trivia:d:${ctx.author.id}:${question.id}`,
        label: "D",
        style: ButtonStyle.Primary,
        emoji: { name: "🇩" },
      }),
    );

    await ctx.write({
      embeds: [embed],
      components: [row1, row2],
      flags: MessageFlags.Ephemeral,
    });
  }

  private async showExistingQuestion(
    ctx: GuildCommandContext,
    questionId: string,
    expiresAt: Date,
  ) {
    const { getQuestionById } = await import("@/modules/economy/minigames");
    const question = getQuestionById(questionId);

    if (!question) {
      minigameService.clearTriviaSession(ctx.author.id, ctx.guildId!);
      await this.startTrivia(ctx, ctx.guildId!, ctx.author.id);
      return;
    }

    const difficultyConfig = DIFFICULTY_CONFIG[question.difficulty];
    const optionsText = question.options
      .map((opt, i) => `${["A", "B", "C", "D"][i]}) ${opt}`)
      .join("\n");

    const timeRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));

    const embed = new Embed()
      .setColor(difficultyConfig.color)
      .setTitle(`${difficultyConfig.emoji} Trivia - ${difficultyConfig.name}`)
      .setDescription(
        `**Category:** ${question.category}\n` +
        `**Question:** ${question.question}\n\n` +
        `${optionsText}\n\n` +
        `⏱️ Time remaining: ${timeRemaining}s\n\n` +
        `_You already have an active question. Answer with the buttons:_`
      );

    const row1 = new ActionRow<Button>().addComponents(
      new Button({
        custom_id: `trivia:a:${ctx.author.id}:${question.id}`,
        label: "A",
        style: ButtonStyle.Primary,
        emoji: { name: "🇦" },
      }),
      new Button({
        custom_id: `trivia:b:${ctx.author.id}:${question.id}`,
        label: "B",
        style: ButtonStyle.Primary,
        emoji: { name: "🇧" },
      }),
    );

    const row2 = new ActionRow<Button>().addComponents(
      new Button({
        custom_id: `trivia:c:${ctx.author.id}:${question.id}`,
        label: "C",
        style: ButtonStyle.Primary,
        emoji: { name: "🇨" },
      }),
      new Button({
        custom_id: `trivia:d:${ctx.author.id}:${question.id}`,
        label: "D",
        style: ButtonStyle.Primary,
        emoji: { name: "🇩" },
      }),
    );

    await ctx.write({
      embeds: [embed],
      components: [row1, row2],
      flags: MessageFlags.Ephemeral,
    });
  }
}
