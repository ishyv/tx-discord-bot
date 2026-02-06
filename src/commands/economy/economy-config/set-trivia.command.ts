/**
 * Economy Config Set Trivia Subcommand (Phase 9c).
 *
 * Purpose: Admin-only configuration for trivia settings including difficulty multipliers,
 * streak bonuses, cooldowns, and daily limits.
 */

import {
  Declare,
  Options,
  SubCommand,
  createIntegerOption,
  createBooleanOption,
  createNumberOption,
  type GuildCommandContext,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { UIColors } from "@/modules/ui/design-system";
import { checkEconomyPermission } from "@/modules/economy/permissions";
import { economyAuditRepo, buildErrorEmbed } from "@/modules/economy";
import { minigameRepo } from "@/modules/economy/minigames";
import { DIFFICULTY_CONFIG } from "@/modules/economy/minigames";

const options = {
  enabled: createBooleanOption({
    description: "Enable/disable trivia",
    required: false,
  }),
  base_reward: createIntegerOption({
    description: "Base currency reward for correct answer",
    required: false,
    min_value: 1,
    max_value: 1000,
  }),
  base_xp: createIntegerOption({
    description: "Base XP for correct answer",
    required: false,
    min_value: 1,
    max_value: 100,
  }),
  cooldown: createIntegerOption({
    description: "Cooldown between questions (seconds)",
    required: false,
    min_value: 5,
    max_value: 3600,
  }),
  daily_max: createIntegerOption({
    description: "Daily question limit per user",
    required: false,
    min_value: 1,
    max_value: 100,
  }),
  timeout: createIntegerOption({
    description: "Time limit to answer (seconds)",
    required: false,
    min_value: 10,
    max_value: 300,
  }),
  streak_enabled: createBooleanOption({
    description: "Enable streak bonus for correct answers",
    required: false,
  }),
  streak_bonus: createNumberOption({
    description: "Bonus per consecutive correct answer (e.g. 0.1 = 10%)",
    required: false,
    min_value: 0,
    max_value: 0.5,
  }),
  max_streak_bonus: createNumberOption({
    description: "Max accumulated streak bonus (e.g. 0.5 = 50%)",
    required: false,
    min_value: 0,
    max_value: 2,
  }),
  show: createBooleanOption({
    description: "Show current configuration without changing",
    required: false,
  }),
};

@Declare({
  name: "trivia-settings",
  description: "Configure trivia settings (multipliers, streaks, limits)",
})
@Options(options)
export default class EconomyConfigSetTriviaCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        embeds: [buildErrorEmbed("This command only works in servers.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { EconomyPermissionLevel } = await import(
      "@/modules/economy/permissions"
    );
    const hasAdmin = await checkEconomyPermission(
      ctx.member,
      EconomyPermissionLevel.ADMIN,
    );
    if (!hasAdmin) {
      await ctx.write({
        embeds: [buildErrorEmbed("You need administrator permissions.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get current config
    const configResult = await minigameRepo.getTriviaConfig(guildId);
    if (configResult.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed("Could not load configuration.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const config = configResult.unwrap();

    // If show option is set or no changes, just display current config
    const hasChanges = Object.keys(options).some(
      key => key !== "show" && ctx.options[key as keyof typeof options] !== undefined
    );

    if (ctx.options.show || !hasChanges) {
      await this.showConfig(ctx, config);
      return;
    }

    // Build update object
    const update: Record<string, unknown> = {};

    if (ctx.options.enabled !== undefined) update.enabled = ctx.options.enabled;
    if (ctx.options.base_reward !== undefined) update.baseCurrencyReward = ctx.options.base_reward;
    if (ctx.options.base_xp !== undefined) update.baseXpReward = ctx.options.base_xp;
    if (ctx.options.cooldown !== undefined) update.cooldownSeconds = ctx.options.cooldown;
    if (ctx.options.daily_max !== undefined) update.dailyMaxPlays = ctx.options.daily_max;
    if (ctx.options.timeout !== undefined) update.timeoutSeconds = ctx.options.timeout;
    if (ctx.options.streak_enabled !== undefined) update.streakBonusEnabled = ctx.options.streak_enabled;
    if (ctx.options.streak_bonus !== undefined) update.streakBonusPerQuestion = ctx.options.streak_bonus;
    if (ctx.options.max_streak_bonus !== undefined) update.maxStreakBonus = ctx.options.max_streak_bonus;

    // Apply updates
    const updateResult = await minigameRepo.updateTriviaConfig(guildId, update);
    if (updateResult.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed("Could not update configuration.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Create audit entry
    const correlationId = `config_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await economyAuditRepo.create({
      operationType: "config_update",
      actorId: ctx.author.id,
      targetId: guildId,
      guildId,
      source: "economy-config set trivia",
      metadata: {
        correlationId,
        before: config,
        after: updateResult.unwrap(),
        changes: update,
      },
    });

    await ctx.write({
      embeds: [{
        color: UIColors.success,
        title: "✅ Trivia Configuration Updated",
        description: "Changes successfully applied.",
        fields: Object.entries(update).map(([key, value]) => ({
          name: key,
          value: String(value),
          inline: true,
        })),
        footer: { text: `ID: ${correlationId.slice(-8)}` },
      }],
      flags: MessageFlags.Ephemeral,
    });
  }

  private async showConfig(ctx: GuildCommandContext, config: any) {
    const { Embed } = await import("seyfert");

    const embed = new Embed()
      .setColor(UIColors.info)
      .setTitle("⚙️ Trivia Configuration")
      .setDescription(`Status: ${config.enabled ? "✅ Active" : "🚫 Disabled"}`)
      .addFields(
        {
          name: "💰 Base Rewards",
          value:
            `Coins: ${config.baseCurrencyReward}\n` +
            `XP: ${config.baseXpReward}`,
          inline: true,
        },
        {
          name: "⏱️ Time Limits",
          value:
            `Cooldown: ${config.cooldownSeconds}s\n` +
            `Timeout: ${config.timeoutSeconds}s`,
          inline: true,
        },
        {
          name: "📅 Daily Limits",
          value: `Daily max: ${config.dailyMaxPlays} questions`,
          inline: true,
        },
        {
          name: "🔥 Streak System",
          value:
            `Enabled: ${config.streakBonusEnabled ? "✅" : "🚫"}\n` +
            `Streak bonus: ${(config.streakBonusPerQuestion * 100).toFixed(0)}%\n` +
            `Max bonus: ${(config.maxStreakBonus * 100).toFixed(0)}%`,
          inline: true,
        },
        {
          name: "📈 Difficulty Multipliers",
          value: Object.entries(DIFFICULTY_CONFIG)
            .map(([level, diff]) =>
              `${diff.emoji} Level ${level}: ${diff.currencyMultiplier}x coins, ${diff.xpMultiplier}x XP`
            )
            .join("\n"),
          inline: false,
        }
      )
      .setFooter({ text: "Use /economy-config trivia <option> to change" });

    await ctx.write({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }
}
