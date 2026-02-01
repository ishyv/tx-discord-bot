/**
 * Hybrid Work Payout Integration Tests.
 */

import * as UsersRepo from "../../src/db/repositories/users";
import * as GuildsRepo from "../../src/db/repositories/guilds";
import {
    workService,
    guildEconomyRepo,
    economyAccountRepo,
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
    ],
};
