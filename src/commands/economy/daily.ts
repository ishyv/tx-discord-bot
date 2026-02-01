/**
 * Daily Command (Phase 3b).
 *
 * Purpose: User claims a configurable amount of primary currency once per 24h (guild).
 * Cooldown: guild-configurable (default 24h). Concurrency-safe. Audited as DAILY_CLAIM.
 */

import { Command, type CommandContext, Declare } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import {
  buildDailyClaimAuditMetadata,
  computeDailyStreakBonus,
  createEconomyAccountService,
  currencyMutationService,
  dailyClaimRepo,
  economyAccountRepo,
  economyAuditRepo,
  guildEconomyService,
  perkService,
  progressionService,
  buildErrorEmbed,
} from "@/modules/economy";
import { buildDailyClaimEmbed } from "@/modules/economy/account/embeds";
import { currencyRegistry } from "@/modules/economy/transactions";

@Declare({
  name: "daily",
  description: "Claim your daily currency reward (once per 24h)",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
export default class DailyCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;

    if (!guildId) {
      await ctx.write({
        embeds: [buildErrorEmbed("This command can only be used in a server.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const accountService = createEconomyAccountService(economyAccountRepo);
    const ensureResult = await accountService.ensureAccount(userId);
    if (ensureResult.isErr()) {
      await ctx.write({
        embeds: [
          buildErrorEmbed("Could not load your account. Try again later."),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { account } = ensureResult.unwrap();
    if (account.status !== "ok") {
      await ctx.write({
        embeds: [
          buildErrorEmbed(
            "Your account has restrictions. You cannot claim daily.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const configResult = await guildEconomyService.getConfig(guildId);
    if (configResult.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed("Economy is not configured for this server.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const config = configResult.unwrap();
    const {
      dailyReward,
      dailyCooldownHours,
      dailyCurrencyId,
      dailyFeeRate = 0,
      dailyFeeSector = "tax",
      dailyStreakBonus = 0,
      dailyStreakCap = 0,
    } = config.daily;

    // Get daily bonus cap from perks
    const effectsResult = await perkService.getEffects(guildId, userId);
    const perkStreakCap = effectsResult.isOk()
      ? effectsResult.unwrap().dailyBonusCap
      : 0;
    const effectiveStreakCap = dailyStreakCap + perkStreakCap;

    // Try to acquire claim lock (atomic cooldown)
    const claimResult = await dailyClaimRepo.tryClaim(
      guildId,
      userId,
      dailyCooldownHours,
    );
    if (claimResult.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed("Something went wrong. Try again later.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const claim = claimResult.unwrap();
    if (!claim.granted) {
      await ctx.write({
        embeds: [
          buildErrorEmbed(
            `You already claimed your daily. You can claim again in **${dailyCooldownHours}h**.\n\n💡 Come back later to continue your streak!`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const streakAfter = claim.streakAfter ?? 1;
    const streakBefore = claim.streakBefore ?? Math.max(0, streakAfter - 1);
    const bestStreakAfter =
      claim.bestStreakAfter ?? Math.max(streakAfter, streakBefore);
    const streakBonus = computeDailyStreakBonus({
      streak: streakAfter,
      perStreakBonus: dailyStreakBonus,
      streakCap: effectiveStreakCap,
    });
    const totalReward = dailyReward + streakBonus;

    // Compute fee and net reward
    const fee = Math.floor(totalReward * dailyFeeRate);
    const netReward = totalReward - fee;
    const correlationId = `daily_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Perform both mutations atomically (all-or-nothing)
    let userAdjustment, sectorAdjustment;
    let userError, sectorError;
    if (fee > 0) {
      try {
        // 1. Grant netReward to user
        const adjustResult =
          await currencyMutationService.adjustCurrencyBalance(
            {
              actorId: userId,
              targetId: userId,
              guildId,
              currencyId: dailyCurrencyId,
              delta: netReward,
              reason: "daily claim (net after fee)",
            },
            async () => true,
          );
        if (adjustResult.isErr()) {
          userError = adjustResult.error;
          throw adjustResult.error;
        }
        userAdjustment = adjustResult.unwrap();

        // 2. Deposit fee to sector
        const sectorResult = await guildEconomyService.depositToSector({
          guildId,
          sector: dailyFeeSector,
          amount: fee,
          source: "daily_fee",
          reason: `Daily claim fee from ${userId}`,
        });
        if (sectorResult.isErr()) {
          sectorError = sectorResult.error;
          // Rollback user grant if possible
          await currencyMutationService.adjustCurrencyBalance(
            {
              actorId: userId,
              targetId: userId,
              guildId,
              currencyId: dailyCurrencyId,
              delta: -netReward,
              reason: "rollback daily claim (fee deposit failed)",
            },
            async () => true,
          );
          throw sectorResult.error;
        }
        sectorAdjustment = sectorResult.unwrap();
      } catch (err) {
        await ctx.write({
          content: `Could not grant daily: ${(userError || sectorError || err)?.toString()}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    } else {
      // No fee: grant full reward as before
      const adjustResult = await currencyMutationService.adjustCurrencyBalance(
        {
          actorId: userId,
          targetId: userId,
          guildId,
          currencyId: dailyCurrencyId,
          delta: totalReward,
          reason: "daily claim",
        },
        async () => true,
      );
      if (adjustResult.isErr()) {
        await ctx.write({
          content: "Could not grant the reward. Try again later.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      userAdjustment = adjustResult.unwrap();
    }

    // Audit
    await economyAuditRepo.create({
      operationType: "daily_claim",
      actorId: userId,
      targetId: userId,
      guildId,
      source: "daily",
      reason: "daily claim",
      currencyData: {
        currencyId: dailyCurrencyId,
        delta: fee > 0 ? netReward : totalReward,
        beforeBalance: userAdjustment.before,
        afterBalance: userAdjustment.after,
      },
      metadata: buildDailyClaimAuditMetadata({
        correlationId,
        fee,
        streakBefore,
        streakAfter,
        bestStreakAfter,
        streakBonus,
        baseReward: dailyReward,
        totalReward,
        netReward,
        feeSector: fee > 0 ? dailyFeeSector : null,
      }),
    });
    if (fee > 0 && sectorAdjustment) {
      await economyAuditRepo.create({
        operationType: "config_update", // fallback: no sector_deposit type
        actorId: userId,
        targetId: userId,
        guildId,
        source: "daily_fee",
        reason: `Daily claim fee from ${userId}`,
        currencyData: {
          currencyId: dailyCurrencyId,
          delta: fee,
          beforeBalance: sectorAdjustment.before,
          afterBalance: sectorAdjustment.after,
        },
        metadata: {
          correlationId,
          sector: dailyFeeSector,
        },
      });
    }

    const currencyObj = currencyRegistry.get(dailyCurrencyId);
    const display = (n: number) =>
      currencyObj?.display(n as any) ?? `${n} ${dailyCurrencyId}`;

    let levelUp = false;
    let newLevel = 0;
    const xpAmount = config.progression.xpAmounts.daily_claim ?? 0;
    if (xpAmount > 0) {
      const xpResult = await progressionService.addXP({
        guildId,
        userId,
        sourceOp: "daily_claim",
        amount: xpAmount,
        correlationId,
        metadata: {
          source: "daily",
        },
      });
      if (xpResult.isOk() && xpResult.unwrap().leveledUp) {
        levelUp = true;
        newLevel = xpResult.unwrap().afterLevel;
      }
    }

    const embed = buildDailyClaimEmbed({
      amount: dailyReward,
      streak: streakAfter,
      bestStreak: bestStreakAfter,
      streakBonus,
      fee,
      netAmount: fee > 0 ? netReward : totalReward,
      currencyId: dailyCurrencyId,
      display,
      balanceBefore: userAdjustment.before as number,
      balanceAfter: userAdjustment.after as number,
      correlationId,
      levelUp,
      newLevel,
    });

    await ctx.write({ embeds: [embed] });
  }
}
