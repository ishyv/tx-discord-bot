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
import { EmbedColors } from "seyfert/lib/common";
import { checkEconomyPermission } from "@/modules/economy/permissions";
import { economyAuditRepo, buildErrorEmbed } from "@/modules/economy";
import { minigameRepo } from "@/modules/economy/minigames";
import { DIFFICULTY_CONFIG } from "@/modules/economy/minigames";

const options = {
  enabled: createBooleanOption({
    description: "Activar/desactivar trivia",
    required: false,
  }),
  base_reward: createIntegerOption({
    description: "Recompensa base de monedas por respuesta correcta",
    required: false,
    min_value: 1,
    max_value: 1000,
  }),
  base_xp: createIntegerOption({
    description: "XP base por respuesta correcta",
    required: false,
    min_value: 1,
    max_value: 100,
  }),
  cooldown: createIntegerOption({
    description: "Cooldown entre preguntas (segundos)",
    required: false,
    min_value: 5,
    max_value: 3600,
  }),
  daily_max: createIntegerOption({
    description: "Máximo de preguntas diarias por usuario",
    required: false,
    min_value: 1,
    max_value: 100,
  }),
  timeout: createIntegerOption({
    description: "Tiempo límite para responder (segundos)",
    required: false,
    min_value: 10,
    max_value: 300,
  }),
  streak_enabled: createBooleanOption({
    description: "Activar bonus por racha de respuestas correctas",
    required: false,
  }),
  streak_bonus: createNumberOption({
    description: "Bonus por cada respuesta correcta consecutiva (ej: 0.1 = 10%)",
    required: false,
    min_value: 0,
    max_value: 0.5,
  }),
  max_streak_bonus: createNumberOption({
    description: "Máximo bonus acumulado por racha (ej: 0.5 = 50%)",
    required: false,
    min_value: 0,
    max_value: 2,
  }),
  show: createBooleanOption({
    description: "Mostrar configuración actual sin cambiar",
    required: false,
  }),
};

@Declare({
  name: "trivia",
  description: "Configurar ajustes de trivia (multiplicadores, rachas, límites)",
})
@Options(options)
export default class EconomyConfigSetTriviaCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        embeds: [buildErrorEmbed("Este comando solo funciona en servidores.")],
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
        embeds: [buildErrorEmbed("Necesitas permisos de administrador.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get current config
    const configResult = await minigameRepo.getTriviaConfig(guildId);
    if (configResult.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed("No se pudo cargar la configuración.")],
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
        embeds: [buildErrorEmbed("No se pudo actualizar la configuración.")],
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
        color: EmbedColors.Green,
        title: "✅ Configuración de Trivia Actualizada",
        description: "Los cambios han sido aplicados exitosamente.",
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
      .setColor(EmbedColors.Blue)
      .setTitle("⚙️ Configuración de Trivia")
      .setDescription(`Estado: ${config.enabled ? "✅ Activo" : "🚫 Desactivado"}`)
      .addFields(
        {
          name: "💰 Recompensas Base",
          value: 
            `Monedas: ${config.baseCurrencyReward}\n` +
            `XP: ${config.baseXpReward}`,
          inline: true,
        },
        {
          name: "⏱️ Límites de Tiempo",
          value:
            `Cooldown: ${config.cooldownSeconds}s\n` +
            `Timeout: ${config.timeoutSeconds}s`,
          inline: true,
        },
        {
          name: "📅 Límites Diarios",
          value: `Máximo diario: ${config.dailyMaxPlays} preguntas`,
          inline: true,
        },
        {
          name: "🔥 Sistema de Rachas",
          value:
            `Activado: ${config.streakBonusEnabled ? "✅" : "🚫"}\n` +
            `Bonus por racha: ${(config.streakBonusPerQuestion * 100).toFixed(0)}%\n` +
            `Máximo bonus: ${(config.maxStreakBonus * 100).toFixed(0)}%`,
          inline: true,
        },
        {
          name: "📈 Multiplicadores por Dificultad",
          value: Object.entries(DIFFICULTY_CONFIG)
            .map(([level, diff]) => 
              `${diff.emoji} Nivel ${level}: ${diff.currencyMultiplier}x monedas, ${diff.xpMultiplier}x XP`
            )
            .join("\n"),
          inline: false,
        }
      )
      .setFooter({ text: "Usa /economy-config trivia <opción> para cambiar" });

    await ctx.write({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }
}
