/**
 * Daily Payout Service.
 * 
 * Purpose: Handle transactional dynamic daily payouts (minted base + treasury bonus).
 * Context: Rewards depend on guild treasury health.
 */

import { getMongoClient, getDb } from "@/db/mongo";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { GuildId, UserId } from "@/db/types";
import { guildEconomyService } from "../guild";
import { economyAuditRepo } from "../audit/repository";
import { perkService } from "../perks/service";
import { progressionService } from "../progression/service";
import { dailyClaimRepo } from "../daily/repository";
import { computeDailyStreakBonus } from "../daily/bonus";

export interface DailyPayoutResult {
    readonly granted: boolean;
    readonly reason?: "cooldown" | "unknown";
    readonly cooldownEndsAt?: Date;
    readonly baseMint: number;
    readonly bonusFromTreasury: number;
    readonly streakBonus: number;
    readonly totalBeforeFee: number;
    readonly fee: number;
    readonly totalPaid: number;
    readonly currencyId: string;
    readonly streak: number;
    readonly bestStreak: number;
    readonly userBalanceBefore: number;
    readonly userBalanceAfter: number;
    readonly treasuryBefore?: number;
    readonly treasuryAfter?: number;
    readonly correlationId: string;
    readonly levelUp: boolean;
    readonly newLevel: number;
}

export interface DailyService {
    processDynamicDailyPayout(guildId: GuildId, userId: UserId): Promise<Result<DailyPayoutResult, Error>>;
}

class DailyServiceImpl implements DailyService {
    async processDynamicDailyPayout(guildId: GuildId, userId: UserId): Promise<Result<DailyPayoutResult, Error>> {
        const configResult = await guildEconomyService.getConfig(guildId);
        if (configResult.isErr()) return ErrResult(configResult.error);
        const config = configResult.unwrap();

        const {
            dailyCooldownHours,
            dailyCurrencyId,
            dailyFeeRate = 0,
            dailyFeeSector = "tax",
            dailyStreakBonus = 5,
            dailyStreakCap = 10,
            rewardScaleMode = "flat",
            rewardBaseMint = 10,
            rewardBonusMax = 40,
        } = config.daily;

        const currencyId = dailyCurrencyId || "coins";
        const correlationId = `daily_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // 1. Get streak cap from perks
        const effectsResult = await perkService.getEffects(guildId, userId);
        const perkStreakCap = effectsResult.isOk() ? effectsResult.unwrap().dailyBonusCap : 0;
        const effectiveStreakCap = dailyStreakCap + perkStreakCap;

        // 2. Prepare RNG factor
        const rngFactor = 0.9 + Math.random() * 0.2;

        const client = await getMongoClient();
        const session = client.startSession();

        let finalResult: DailyPayoutResult | undefined;

        try {
            await session.withTransaction(async () => {
                const db = await getDb();
                const now = new Date();

                // A. Check/Acquire Cooldown Atomic Lock
                const claimResult = await dailyClaimRepo.tryClaim(guildId, userId, dailyCooldownHours);
                if (claimResult.isErr()) throw claimResult.error;

                const claim = claimResult.unwrap();
                if (!claim.granted) {
                    const existing = await db.collection("economy_daily_claims").findOne({ _id: `${guildId}:${userId}` as any }, { session });
                    let cooldownEndsAt: Date | undefined;
                    if (existing && (existing as any).lastClaimAt) {
                        cooldownEndsAt = new Date((existing as any).lastClaimAt.getTime() + (dailyCooldownHours * 60 * 60 * 1000));
                    }

                    finalResult = {
                        granted: false,
                        reason: "cooldown",
                        cooldownEndsAt,
                        baseMint: 0,
                        bonusFromTreasury: 0,
                        streakBonus: 0,
                        totalBeforeFee: 0,
                        fee: 0,
                        totalPaid: 0,
                        currencyId,
                        streak: (existing as any)?.streak || 0,
                        bestStreak: (existing as any)?.bestStreak || 0,
                        userBalanceBefore: 0,
                        userBalanceAfter: 0,
                        correlationId,
                        levelUp: false,
                        newLevel: 0,
                    };
                    throw new Error("CLAIM_DENIED");
                }

                const streakAfter = claim.streakAfter ?? 1;
                const bestStreakAfter = claim.bestStreakAfter ?? streakAfter;

                // B. Calculate Rewards
                const baseMint = Math.round(rewardBaseMint * rngFactor);

                // Get Treasury (Global sector)
                const guildsCol = db.collection("guilds");
                const guildDoc = await guildsCol.findOne({ _id: guildId as any }, { session });
                if (!guildDoc) throw new Error("GUILD_NOT_FOUND");

                const treasurySector = "global";
                const sectorPath = `economy.sectors.${treasurySector}`;
                const treasuryBefore = (guildDoc as any).economy?.sectors?.[treasurySector] ?? 0;

                let bonusFromTreasury = 0;
                let treasuryAfter = treasuryBefore;

                let desiredBonus = 0;
                if (rewardScaleMode === "percent") {
                    desiredBonus = Math.round(rewardBonusMax * rngFactor);
                } else {
                    desiredBonus = Math.round(rewardBonusMax * rngFactor);
                }

                // If treasury has funds, take up to desiredBonus
                if (desiredBonus > 0 && treasuryBefore > 0) {
                    const actualBonus = Math.min(desiredBonus, treasuryBefore);
                    const sectorUpdate = await guildsCol.findOneAndUpdate(
                        { _id: guildId as any, [sectorPath]: { $gt: 0 } } as any,
                        { $inc: { [sectorPath]: -actualBonus } as any },
                        { returnDocument: "after", session }
                    );
                    if (sectorUpdate) {
                        bonusFromTreasury = actualBonus;
                        treasuryAfter = (sectorUpdate as any).economy?.sectors?.[treasurySector];
                    }
                }

                const streakBonus = computeDailyStreakBonus({
                    streak: streakAfter,
                    perStreakBonus: dailyStreakBonus,
                    streakCap: effectiveStreakCap,
                });

                const totalBeforeFee = baseMint + bonusFromTreasury + streakBonus;
                const fee = Math.floor(totalBeforeFee * dailyFeeRate);
                const totalPaid = totalBeforeFee - fee;

                // C. Update User Balance
                const usersCol = db.collection("users");
                const userSnapshot = await usersCol.findOne({ _id: userId as any }, { session });
                if (!userSnapshot) throw new Error("USER_NOT_FOUND");

                const balancePath = `currency.${currencyId}`;
                const userBalanceBefore = ((userSnapshot as any).currency?.[currencyId] as any)?.hand ?? (userSnapshot as any).currency?.[currencyId] ?? 0;

                // Logic for sub-field or direct field
                const balanceIncPath = balancePath + (((userSnapshot as any).currency?.[currencyId] as any)?.hand !== undefined ? ".hand" : "");

                // D. Progression
                const xpAmount = config.progression.xpAmounts.daily_claim ?? 0;
                let levelUp = false;
                let newLevel = 0;


                // Note: progressionService.addXP usually handles this but we're in a transaction
                // We'll use a simplified version or just stick to the service if it doesn't need its own transaction
                // Actually, let's just update the doc here.

                const userUpdate = await usersCol.findOneAndUpdate(
                    { _id: userId as any } as any,
                    {
                        $inc: { [balanceIncPath]: totalPaid } as any,
                        $set: { updatedAt: now } as any
                    },
                    { returnDocument: "after", session }
                );
                if (!userUpdate) throw new Error("USER_UPDATE_FAILED");
                const userBalanceAfter = ((userUpdate as any).currency?.[currencyId] as any)?.hand ?? (userUpdate as any).currency?.[currencyId] ?? 0;

                // Progress update (outside or via session if supported)
                if (xpAmount > 0) {
                    const progRes = await progressionService.addXP({
                        guildId,
                        userId,
                        amount: xpAmount,
                        sourceOp: "daily_claim",
                        correlationId
                    });
                    if (progRes.isOk()) {
                        levelUp = progRes.unwrap().leveledUp;
                        newLevel = progRes.unwrap().afterLevel;
                    }
                }

                // E. Deposit fees if any
                if (fee > 0) {
                    await guildsCol.updateOne(
                        { _id: guildId as any } as any,
                        { $inc: { [`economy.sectors.${dailyFeeSector}`]: fee } as any },
                        { session }
                    );
                }

                // F. Audit
                await economyAuditRepo.create({
                    operationType: "daily_claim",
                    actorId: userId,
                    targetId: userId,
                    guildId,
                    source: "daily",
                    reason: "daily claim",
                    currencyData: {
                        currencyId,
                        delta: totalPaid,
                        beforeBalance: userBalanceBefore,
                        afterBalance: userBalanceAfter
                    },
                    metadata: {
                        correlationId,
                        baseMint,
                        bonusFromTreasury,
                        streakBonus,
                        totalBeforeFee,
                        fee,
                        streak: streakAfter,
                        bestStreak: bestStreakAfter,
                        treasuryBefore,
                        treasuryAfter,
                        isMinted: baseMint > 0,
                        isRedistribution: bonusFromTreasury > 0
                    }
                }, { session });

                finalResult = {
                    granted: true,
                    baseMint,
                    bonusFromTreasury,
                    streakBonus,
                    totalBeforeFee,
                    fee,
                    totalPaid,
                    currencyId,
                    streak: streakAfter,
                    bestStreak: bestStreakAfter,
                    userBalanceBefore,
                    userBalanceAfter,
                    treasuryBefore,
                    treasuryAfter,
                    correlationId,
                    levelUp,
                    newLevel
                };
            });

            return OkResult(finalResult!);
        } catch (e) {
            if ((e as Error).message === "CLAIM_DENIED") {
                return OkResult(finalResult!);
            }
            return ErrResult(e instanceof Error ? e : new Error(String(e)));
        } finally {
            await session.endSession();
        }
    }
}

export const dailyService: DailyService = new DailyServiceImpl();
