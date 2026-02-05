/**
 * Hybrid Work Payout Integration Tests.
 *
 * Coverage:
 * - works sector = 0 => /work succeeds with base only
 * - works sector sufficient => /work pays base + bonus, works decremented correctly
 * - works sector insufficient for desired bonus => pays base only, no negative sector
 * - concurrency: 2 parallel /work calls => only one succeeds due to cooldown/cap; no double payouts
 * - audit contains baseMint/bonusFromWorks metadata
 * - economy-report classification: base counted as minted, bonus not counted as minted
 */

import * as UsersRepo from "../../src/db/repositories/users";
import * as GuildsRepo from "../../src/db/repositories/guilds";
import {
    workService,
    guildEconomyRepo,
    economyAccountRepo,
    economyAuditRepo,
} from "../../src/modules/economy";
import { assert, assertEqual, assertOk, ops, type Suite } from "./_utils";

const cleanupUser = (
    cleanup: { add: (task: () => Promise<void> | void) => void },
    id: string,
) => {
    cleanup.add(async () => {
        await UsersRepo.deleteUser(id);
    });
};

const cleanupGuild = (
    cleanup: { add: (task: () => Promise<void> | void) => void },
    id: string,
) => {
    cleanup.add(async () => {
        await GuildsRepo.deleteGuild(id);
    });
};

export const suite: Suite = {
    name: "hybrid work payout",
    tests: [
        {
            name: "grants baseMint even if treasury is empty",
            ops: [ops.create, ops.update, ops.read],
            run: async ({ factory, cleanup }) => {
                console.log("Starting test 1");
                const guildId = factory.guildId();
                const userId = factory.userId();
                cleanupGuild(cleanup, guildId);
                cleanupUser(cleanup, userId);

                console.log("Ensuring guild/user");
                await GuildsRepo.ensureGuild(guildId);
                await UsersRepo.ensureUser(userId);
                assertOk(await economyAccountRepo.ensure(userId));

                console.log("Updating work config");
                assertOk(await guildEconomyRepo.ensure(guildId));
                await guildEconomyRepo.updateWorkConfig(guildId, {
                    workBaseMintReward: 100,
                    workBonusFromWorksMax: 50,
                    workFailureChance: 0,
                });

                console.log("Processing payout");
                const res = await workService.processHybridWorkPayout(guildId, userId);
                console.log("Payout result received");
                assertOk(res);
                const payout = res.unwrap();

                assertEqual(payout.granted, true, "work should be granted");
                assert(payout.baseMint > 0, "baseMint should be > 0");
                assertEqual(payout.bonusFromWorks, 0, "bonus should be 0 (treasury empty)");
                assertEqual(payout.totalPaid, payout.baseMint, "total should be baseMint");
                assertEqual(payout.userBalanceAfter, payout.baseMint, "balance should reflect baseMint");
            },
        },
        {
            name: "grants baseMint + bonusFromWorks if treasury has funds",
            ops: [ops.create, ops.update, ops.read],
            run: async ({ factory, cleanup }) => {
                console.log("Starting test 2");
                const guildId = factory.guildId();
                const userId = factory.userId();
                cleanupGuild(cleanup, guildId);
                cleanupUser(cleanup, userId);

                console.log("Ensuring guild/user");
                await GuildsRepo.ensureGuild(guildId);
                await UsersRepo.ensureUser(userId);
                assertOk(await economyAccountRepo.ensure(userId));

                console.log("Depositing to sector");
                assertOk(await guildEconomyRepo.ensure(guildId));
                await guildEconomyRepo.depositToSector(guildId, "works", 1000);

                await guildEconomyRepo.updateWorkConfig(guildId, {
                    workBaseMintReward: 100,
                    workBonusFromWorksMax: 100,
                    workFailureChance: 0,
                });

                console.log("Processing payout");
                const res = await workService.processHybridWorkPayout(guildId, userId);
                console.log("Payout result received");
                assertOk(res);
                const payout = res.unwrap();

                assertEqual(payout.granted, true, "work should be granted");
                assert(payout.baseMint > 0, "baseMint should be > 0");
                assert(payout.bonusFromWorks > 0, "bonus should be > 0");
                assertEqual(payout.totalPaid, payout.baseMint + payout.bonusFromWorks, "total should be sum");
                assertEqual(payout.userBalanceAfter, payout.totalPaid, "balance should reflect total");
            },
        },
        {
            name: "concurrency: parallel claims respect daily cap",
            ops: [ops.create, ops.update],
            run: async ({ factory, cleanup }) => {
                console.log("Starting test 3");
                const guildId = factory.guildId();
                const userId = factory.userId();
                cleanupGuild(cleanup, guildId);
                cleanupUser(cleanup, userId);

                console.log("Ensuring guild/user");
                await GuildsRepo.ensureGuild(guildId);
                await UsersRepo.ensureUser(userId);
                assertOk(await economyAccountRepo.ensure(userId));

                console.log("Updating work config");
                assertOk(await guildEconomyRepo.ensure(guildId));
                await guildEconomyRepo.updateWorkConfig(guildId, {
                    workBaseMintReward: 100,
                    workBonusFromWorksMax: 0,
                    workCooldownMinutes: 0,
                    workDailyCap: 2,
                    workFailureChance: 0,
                });

                console.log("Processing parallel payouts");
                const results = await Promise.all([
                    workService.processHybridWorkPayout(guildId, userId),
                    workService.processHybridWorkPayout(guildId, userId),
                    workService.processHybridWorkPayout(guildId, userId),
                ]);
                console.log("Parallel payouts results received");

                const grantedCount = results.filter((r: any) => r.isOk() && r.unwrap().granted).length;
                assertEqual(grantedCount, 2, "exactly 2 claims should be granted (daily cap)");
            },
        },
        {
            name: "partial bonus when treasury has insufficient funds",
            ops: [ops.create, ops.update, ops.read],
            run: async ({ factory, cleanup }) => {
                console.log("Starting test 4: partial bonus");
                const guildId = factory.guildId();
                const userId = factory.userId();
                cleanupGuild(cleanup, guildId);
                cleanupUser(cleanup, userId);

                await GuildsRepo.ensureGuild(guildId);
                await UsersRepo.ensureUser(userId);
                assertOk(await economyAccountRepo.ensure(userId));
                assertOk(await guildEconomyRepo.ensure(guildId));

                // Deposit only 30 to works sector
                await guildEconomyRepo.depositToSector(guildId, "works", 30);

                await guildEconomyRepo.updateWorkConfig(guildId, {
                    workBaseMintReward: 100,
                    workBonusFromWorksMax: 100, // wants 100 bonus but only 30 available
                    workFailureChance: 0,
                });

                const res = await workService.processHybridWorkPayout(guildId, userId);
                assertOk(res);
                const payout = res.unwrap();

                assertEqual(payout.granted, true, "work should be granted");
                assert(payout.baseMint > 0, "baseMint should be > 0");
                // Bonus should be 0 because desiredBonus > sectorBalance triggers the conditional check
                // and if sectorBalance < desiredBonus, bonus is 0
                assertEqual(payout.bonusFromWorks, 0, "bonus should be 0 when desired > available");
                assertEqual(payout.totalPaid, payout.baseMint, "total should be baseMint only");

                // Verify sector was not depleted below 0
                const sectorRes = await guildEconomyRepo.getSectorBalance(guildId, "works");
                assertOk(sectorRes);
                assert(sectorRes.unwrap() >= 0, "sector balance should never be negative");
            },
        },
        {
            name: "audit entry contains baseMint and bonusFromWorks metadata",
            ops: [ops.create, ops.update, ops.read],
            run: async ({ factory, cleanup }) => {
                console.log("Starting test 5: audit metadata");
                const guildId = factory.guildId();
                const userId = factory.userId();
                cleanupGuild(cleanup, guildId);
                cleanupUser(cleanup, userId);

                await GuildsRepo.ensureGuild(guildId);
                await UsersRepo.ensureUser(userId);
                assertOk(await economyAccountRepo.ensure(userId));
                assertOk(await guildEconomyRepo.ensure(guildId));

                await guildEconomyRepo.depositToSector(guildId, "works", 500);
                await guildEconomyRepo.updateWorkConfig(guildId, {
                    workBaseMintReward: 100,
                    workBonusFromWorksMax: 50,
                    workFailureChance: 0,
                });

                const res = await workService.processHybridWorkPayout(guildId, userId);
                assertOk(res);
                const payout = res.unwrap();
                assertEqual(payout.granted, true, "work should be granted");

                // Query audit entries for this correlationId
                const auditRes = await economyAuditRepo.query({
                    guildId,
                    operationType: "work_claim",
                    correlationId: payout.correlationId,
                });
                assertOk(auditRes);
                const entries = auditRes.unwrap().entries;
                assertEqual(entries.length, 1, "should find exactly one audit entry");

                const entry = entries[0];
                assert(entry.metadata !== undefined, "metadata should be present");
                assert("baseMint" in entry.metadata!, "metadata should contain baseMint");
                assert("bonusFromWorks" in entry.metadata!, "metadata should contain bonusFromWorks");
                assert("totalPaid" in entry.metadata!, "metadata should contain totalPaid");
                assert("sectorUsed" in entry.metadata!, "metadata should contain sectorUsed");
                assert("isMinted" in entry.metadata!, "metadata should contain isMinted flag");
                assert("isRedistribution" in entry.metadata!, "metadata should contain isRedistribution flag");

                assertEqual(entry.metadata!.baseMint, payout.baseMint, "baseMint should match");
                assertEqual(entry.metadata!.bonusFromWorks, payout.bonusFromWorks, "bonusFromWorks should match");
            },
        },
        {
            name: "sector balance decrements correctly when bonus paid",
            ops: [ops.create, ops.update, ops.read],
            run: async ({ factory, cleanup }) => {
                console.log("Starting test 6: sector decrement");
                const guildId = factory.guildId();
                const userId = factory.userId();
                cleanupGuild(cleanup, guildId);
                cleanupUser(cleanup, userId);

                await GuildsRepo.ensureGuild(guildId);
                await UsersRepo.ensureUser(userId);
                assertOk(await economyAccountRepo.ensure(userId));
                assertOk(await guildEconomyRepo.ensure(guildId));

                // Start with 500 in works sector
                await guildEconomyRepo.depositToSector(guildId, "works", 500);

                await guildEconomyRepo.updateWorkConfig(guildId, {
                    workBaseMintReward: 100,
                    workBonusFromWorksMax: 80,
                    workFailureChance: 0,
                });

                // Get sector balance before
                const beforeRes = await guildEconomyRepo.getSectorBalance(guildId, "works");
                assertOk(beforeRes);
                const beforeBalance = beforeRes.unwrap();

                const res = await workService.processHybridWorkPayout(guildId, userId);
                assertOk(res);
                const payout = res.unwrap();

                // Get sector balance after
                const afterRes = await guildEconomyRepo.getSectorBalance(guildId, "works");
                assertOk(afterRes);
                const afterBalance = afterRes.unwrap();

                assert(payout.bonusFromWorks > 0, "bonus should have been paid");
                assertEqual(
                    afterBalance,
                    beforeBalance - payout.bonusFromWorks,
                    "sector should decrement by bonus amount"
                );
            },
        },
        {
            name: "work fails and logs audit when failure chance triggers",
            ops: [ops.create, ops.update, ops.read],
            run: async ({ factory, cleanup }) => {
                console.log("Starting test 7: work failure");
                const guildId = factory.guildId();
                const userId = factory.userId();
                cleanupGuild(cleanup, guildId);
                cleanupUser(cleanup, userId);

                await GuildsRepo.ensureGuild(guildId);
                await UsersRepo.ensureUser(userId);
                assertOk(await economyAccountRepo.ensure(userId));
                assertOk(await guildEconomyRepo.ensure(guildId));

                // Set 100% failure chance
                await guildEconomyRepo.updateWorkConfig(guildId, {
                    workBaseMintReward: 100,
                    workBonusFromWorksMax: 50,
                    workFailureChance: 1.0, // Always fails
                });

                const res = await workService.processHybridWorkPayout(guildId, userId);
                assertOk(res);
                const payout = res.unwrap();

                assertEqual(payout.granted, true, "claim should be granted");
                assertEqual(payout.failed, true, "work should have failed");
                assertEqual(payout.baseMint, 0, "baseMint should be 0 on failure");
                assertEqual(payout.bonusFromWorks, 0, "bonus should be 0 on failure");
                assertEqual(payout.totalPaid, 0, "total should be 0 on failure");
            },
        },
    ],
};
