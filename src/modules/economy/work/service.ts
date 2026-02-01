/**
 * Work Payout Service.
 * 
 * Purpose: Handle transactional hybrid work payouts (minted base + treasury bonus).
 * Encaje: Coordinates WorkClaimRepo, GuildEconomyRepo, UserStore, and AuditRepo in a single transaction.
 */

import { getMongoClient, getDb } from "@/db/mongo";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { GuildId, UserId } from "@/db/types";
import { guildEconomyService } from "../guild";
import { economyAuditRepo } from "../audit/repository";
import { perkService } from "../perks/service";
import { equipmentService } from "../equipment/service";
import { getLevelFromXP } from "../progression/curve";

const getDayStamp = (date: Date) => date.toISOString().slice(0, 10);

export interface WorkPayoutResult {
    readonly granted: boolean;
    readonly reason?: "cooldown" | "cap" | "failure" | "unknown";
    readonly cooldownEndsAt?: Date;
    readonly baseMint: number;
    readonly bonusFromWorks: number;
    readonly totalPaid: number;
    readonly currencyId: string;
    readonly bonusPct: number;
    readonly remainingToday: number;
    readonly dailyCap: number;
    readonly userBalanceBefore: number;
    readonly userBalanceAfter: number;
    readonly sectorBefore?: number;
    readonly sectorAfter?: number;
    readonly correlationId: string;
    readonly levelUp: boolean;
    readonly newLevel: number;
    readonly failed?: boolean;
}

export interface WorkService {
    processHybridWorkPayout(guildId: GuildId, userId: UserId): Promise<Result<WorkPayoutResult, Error>>;
}

class WorkServiceImpl implements WorkService {
    async processHybridWorkPayout(guildId: GuildId, userId: UserId): Promise<Result<WorkPayoutResult, Error>> {
        const configResult = await guildEconomyService.getConfig(guildId);
        if (configResult.isErr()) return ErrResult(configResult.error);
        const config = configResult.unwrap();

        const {
            workBaseMintReward,
            workBonusFromWorksMax,
            workBonusScaleMode,
            workCooldownMinutes,
            workDailyCap,
            workCurrencyId,
            workPaysFromSector,
            workFailureChance = 0.1,
        } = config.work;

        const currencyId = workCurrencyId || config.daily.dailyCurrencyId;
        const correlationId = `work_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // 1. Calculate multipliers (Perks + Equipment)
        const [perkBonusRes, equipStatsRes] = await Promise.all([
            perkService.getWorkBonusPct(guildId, userId),
            equipmentService.getStatsSummary(guildId, userId),
        ]);

        const perkBonusPct = perkBonusRes.isOk() ? perkBonusRes.unwrap() : 0;
        const equipBonusPct = equipStatsRes.isOk() ? equipStatsRes.unwrap().workBonusPct : 0;
        const bonusPct = perkBonusPct + equipBonusPct;

        const rngFactor = 0.9 + Math.random() * 0.2;

        // Calculate Payout components
        const baseMint = Math.round(workBaseMintReward * rngFactor * (1 + bonusPct));

        let desiredBonus = 0;
        if (workBonusScaleMode === "percent") {
            desiredBonus = Math.round(workBonusFromWorksMax * rngFactor * (1 + bonusPct));
        } else {
            desiredBonus = Math.round(workBonusFromWorksMax * rngFactor);
        }

        const failed = workFailureChance > 0 && Math.random() < workFailureChance;

        const client = await getMongoClient();
        const session = client.startSession();

        let finalResult: WorkPayoutResult | undefined;

        try {
            await session.withTransaction(async () => {
                const db = await getDb();
                const now = new Date();
                const dayStamp = getDayStamp(now);
                const cooldownMs = workCooldownMinutes * 60 * 1000;
                const cutoff = new Date(now.getTime() - cooldownMs);

                // A. Check Cooldown/Cap (economy_work_claims)
                const workClaimsCol = db.collection("economy_work_claims");
                const claimId = `${guildId}:${userId}`;

                const claimUpdate = await workClaimsCol.findOneAndUpdate(
                    {
                        _id: claimId as any,
                        $and: [
                            {
                                $or: [
                                    { lastWorkAt: { $exists: false } },
                                    { lastWorkAt: { $lt: cutoff } },
                                ],
                            },
                            {
                                $or: [
                                    { dayStamp: { $ne: dayStamp } },
                                    { workCountToday: { $lt: workDailyCap } },
                                ],
                            },
                        ],
                    } as any,
                    [
                        {
                            $set: {
                                _id: claimId,
                                guildId,
                                userId,
                                dayStamp,
                                lastWorkAt: now,
                                workCountToday: {
                                    $cond: [
                                        { $eq: ["$dayStamp", dayStamp] },
                                        { $add: [{ $ifNull: ["$workCountToday", 0] }, 1] },
                                        1,
                                    ],
                                },
                            },
                        },
                    ] as any,
                    { upsert: true, returnDocument: "after", session }
                );

                if (!claimUpdate) {
                    const existing = await workClaimsCol.findOne({ _id: claimId as any }, { session });
                    let reason: WorkPayoutResult["reason"] = "unknown";
                    let cooldownEndsAt: Date | undefined;
                    let remainingToday = workDailyCap;

                    if (existing) {
                        remainingToday = (existing as any).dayStamp === dayStamp ? Math.max(0, workDailyCap - (existing as any).workCountToday) : workDailyCap;
                        if ((existing as any).lastWorkAt && (existing as any).lastWorkAt >= cutoff) {
                            reason = "cooldown";
                            cooldownEndsAt = new Date((existing as any).lastWorkAt.getTime() + cooldownMs);
                        } else if ((existing as any).dayStamp === dayStamp && (existing as any).workCountToday >= workDailyCap) {
                            reason = "cap";
                        }
                    }

                    finalResult = {
                        granted: false,
                        reason,
                        cooldownEndsAt,
                        baseMint: 0,
                        bonusFromWorks: 0,
                        totalPaid: 0,
                        currencyId,
                        bonusPct,
                        remainingToday,
                        dailyCap: workDailyCap,
                        userBalanceBefore: 0,
                        userBalanceAfter: 0,
                        correlationId,
                        levelUp: false,
                        newLevel: 0,
                    };
                    throw new Error("CLAIM_DENIED");
                }

                const claimRecord = claimUpdate as any;
                const remainingToday = Math.max(0, workDailyCap - claimRecord.workCountToday);

                if (failed) {
                    finalResult = {
                        granted: true,
                        failed: true,
                        baseMint: 0,
                        bonusFromWorks: 0,
                        totalPaid: 0,
                        currencyId,
                        bonusPct,
                        remainingToday,
                        dailyCap: workDailyCap,
                        userBalanceBefore: 0,
                        userBalanceAfter: 0,
                        correlationId,
                        levelUp: false,
                        newLevel: 0,
                    };

                    await economyAuditRepo.create({
                        operationType: "work_claim",
                        actorId: userId,
                        targetId: userId,
                        guildId,
                        source: "work",
                        reason: "work failed",
                        metadata: {
                            correlationId,
                            payout: 0,
                            baseMint: 0,
                            bonusFromWorks: 0,
                            sector: workPaysFromSector,
                            failed: true,
                            reason: "failure_chance",
                            capCount: claimRecord.workCountToday,
                            remainingToday,
                            bonusPct,
                        },
                    }, { session });
                    return;
                }

                const guildsCol = db.collection("guilds");
                const guildDoc = await guildsCol.findOne({ _id: guildId as any }, { session });
                if (!guildDoc) throw new Error("GUILD_NOT_FOUND");

                const sectorPath = `economy.sectors.${workPaysFromSector}`;
                const sectorBalanceBefore = (guildDoc as any).economy?.sectors?.[workPaysFromSector] ?? 0;

                let bonusFromWorks = 0;
                let sectorBalanceAfter = sectorBalanceBefore;

                if (desiredBonus > 0 && sectorBalanceBefore >= desiredBonus) {
                    const sectorUpdate = await guildsCol.findOneAndUpdate(
                        { _id: guildId as any, [sectorPath]: { $gte: desiredBonus } } as any,
                        { $inc: { [sectorPath]: -desiredBonus } as any },
                        { returnDocument: "after", session }
                    );
                    if (sectorUpdate) {
                        bonusFromWorks = desiredBonus;
                        sectorBalanceAfter = (sectorUpdate as any).economy?.sectors?.[workPaysFromSector];
                    }
                }

                const totalPaid = baseMint + bonusFromWorks;

                const usersCol = db.collection("users");
                const userBeforeDoc = await usersCol.findOne({ _id: userId as any }, { session });
                if (!userBeforeDoc) throw new Error("USER_NOT_FOUND");

                const balancePath = `currency.${currencyId}`;
                const userBalanceBefore = (userBeforeDoc as any).currency?.[currencyId]?.hand ?? (userBeforeDoc as any).currency?.[currencyId] ?? 0;

                let levelUp = false;
                let newLevel = 0;
                const xpAmount = config.progression.xpAmounts.work_claim ?? 0;

                const userSnapshot = userBeforeDoc as any;
                const progressionMap = { ...(userSnapshot.progression ?? {}) };
                const currentProgData = progressionMap[guildId] || { totalXP: 0, level: 1, updatedAt: new Date(), cooldowns: {} };

                const beforeXP = currentProgData.totalXP ?? 0;
                const beforeLevel = currentProgData.level ?? 1;

                const nextXP = beforeXP + xpAmount;
                const nextLevel = getLevelFromXP(nextXP);
                levelUp = nextLevel > beforeLevel;
                newLevel = nextLevel;

                const nextProgData = {
                    ...currentProgData,
                    totalXP: nextXP,
                    level: nextLevel,
                    updatedAt: now,
                    cooldowns: {
                        ...(currentProgData.cooldowns || {}),
                        work_claim: now,
                    }
                };
                progressionMap[guildId] = nextProgData;

                const balanceIncPath = balancePath + (userSnapshot.currency?.[currencyId]?.hand !== undefined ? ".hand" : "");

                const userUpdate = await usersCol.findOneAndUpdate(
                    { _id: userId as any } as any,
                    {
                        $inc: { [balanceIncPath]: totalPaid } as any,
                        $set: {
                            updatedAt: now,
                            progression: progressionMap
                        } as any
                    },
                    { returnDocument: "after", session }
                );
                if (!userUpdate) throw new Error("USER_UPDATE_FAILED");

                const userBalanceAfter = (userUpdate as any).currency?.[currencyId]?.hand ?? (userUpdate as any).currency?.[currencyId] ?? 0;

                await economyAuditRepo.create({
                    operationType: "work_claim",
                    actorId: userId,
                    targetId: userId,
                    guildId,
                    source: "work",
                    reason: "work claim",
                    currencyData: {
                        currencyId,
                        delta: totalPaid,
                        beforeBalance: userBalanceBefore,
                        afterBalance: userBalanceAfter,
                    },
                    metadata: {
                        correlationId,
                        baseMint,
                        bonusFromWorks,
                        totalPaid,
                        currencyId,
                        sectorUsed: workPaysFromSector,
                        sectorBefore: sectorBalanceBefore,
                        sectorAfter: sectorBalanceAfter,
                        isMinted: baseMint > 0,
                        isRedistribution: bonusFromWorks > 0,
                        capCount: claimRecord.workCountToday,
                        remainingToday,
                        bonusPct,
                        xpGained: xpAmount,
                        beforeXP,
                        afterXP: nextXP,
                        beforeLevel,
                        afterLevel: nextLevel,
                        leveledUp: levelUp,
                    },
                }, { session });

                if (xpAmount > 0) {
                    await economyAuditRepo.create({
                        operationType: "xp_grant",
                        actorId: userId,
                        targetId: userId,
                        guildId,
                        source: "work_claim",
                        reason: "xp grant (work)",
                        metadata: {
                            correlationId,
                            source: "work_claim",
                            amount: xpAmount,
                            beforeXP,
                            afterXP: nextXP,
                            beforeLevel,
                            afterLevel: nextLevel,
                            leveledUp: levelUp,
                        },
                    }, { session });
                }

                finalResult = {
                    granted: true,
                    baseMint,
                    bonusFromWorks,
                    totalPaid,
                    currencyId,
                    bonusPct,
                    remainingToday,
                    dailyCap: workDailyCap,
                    userBalanceBefore,
                    userBalanceAfter,
                    sectorBefore: sectorBalanceBefore,
                    sectorAfter: sectorBalanceAfter,
                    correlationId,
                    levelUp,
                    newLevel,
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

export const workService: WorkService = new WorkServiceImpl();
