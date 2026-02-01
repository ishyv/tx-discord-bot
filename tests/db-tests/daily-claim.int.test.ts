/**
 * Daily Claim Integration Tests (Phase 3b).
 *
 * Tests:
 * - First claim succeeds
 * - Second claim before cooldown rejects
 * - Claim after cooldown succeeds (using 0h cooldown)
 * - Concurrency: two parallel claims -> only one grants
 * - Audit entry created for daily_claim
 */

import * as UsersRepo from "../../src/db/repositories/users";
import * as GuildsRepo from "../../src/db/repositories/guilds";
import {
  dailyClaimRepo,
  guildEconomyRepo,
  economyAuditRepo,
  economyAccountRepo,
  computeDailyStreakBonus,
  buildDailyClaimAuditMetadata,
} from "../../src/modules/economy";
import { assert, assertEqual, assertOk, ops, type Suite } from "./_utils";

const cleanupUser = (
  cleanup: { add: (task: () => Promise<void> | void) => void },
  id: string,
) => {
  cleanup.add(async () => {
    const res = await UsersRepo.deleteUser(id);
    if (res.isErr()) return;
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
  name: "daily claim",
  tests: [
    {
      name: "first claim succeeds",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));

        const result = await dailyClaimRepo.tryClaim(guildId, userId, 24);
        assertOk(result);
        assertEqual(
          result.unwrap().granted,
          true,
          "first claim should succeed",
        );
      },
    },
    {
      name: "second claim before cooldown rejects",
      ops: [ops.create, ops.update, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));

        const first = await dailyClaimRepo.tryClaim(guildId, userId, 24);
        assertOk(first);
        assertEqual(first.unwrap().granted, true, "first claim should succeed");

        const second = await dailyClaimRepo.tryClaim(guildId, userId, 24);
        assertOk(second);
        assertEqual(
          second.unwrap().granted,
          false,
          "second claim before cooldown should fail",
        );
      },
    },
    {
      name: "claim after cooldown succeeds (0h cooldown)",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));

        const first = await dailyClaimRepo.tryClaim(guildId, userId, 0);
        assertOk(first);
        assertEqual(first.unwrap().granted, true, "first claim should succeed");

        const second = await dailyClaimRepo.tryClaim(guildId, userId, 0);
        assertOk(second);
        assertEqual(
          second.unwrap().granted,
          true,
          "second claim with 0h cooldown should succeed",
        );
      },
    },
    {
      name: "streak increments on consecutive days",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));

        const day1 = new Date("2026-01-01T10:00:00.000Z");
        const day2 = new Date("2026-01-02T10:00:00.000Z");

        const first = await dailyClaimRepo.tryClaim(guildId, userId, 0, day1);
        assertOk(first);
        assertEqual(first.unwrap().streakAfter, 1, "first streak should be 1");

        const second = await dailyClaimRepo.tryClaim(guildId, userId, 0, day2);
        assertOk(second);
        assertEqual(
          second.unwrap().streakAfter,
          2,
          "consecutive day should increment streak",
        );
      },
    },
    {
      name: "streak resets after missed day window",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));

        const day1 = new Date("2026-01-01T10:00:00.000Z");
        const day3 = new Date("2026-01-03T10:00:00.000Z");

        const first = await dailyClaimRepo.tryClaim(guildId, userId, 0, day1);
        assertOk(first);
        assertEqual(first.unwrap().streakAfter, 1, "first streak should be 1");

        const second = await dailyClaimRepo.tryClaim(guildId, userId, 0, day3);
        assertOk(second);
        assertEqual(
          second.unwrap().streakAfter,
          1,
          "missed day should reset streak to 1",
        );
      },
    },
    {
      name: "concurrency: two parallel claims only one grants",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));

        const [a, b] = await Promise.all([
          dailyClaimRepo.tryClaim(guildId, userId, 24),
          dailyClaimRepo.tryClaim(guildId, userId, 24),
        ]);

        assertOk(a);
        assertOk(b);
        const successCount =
          (a.unwrap().granted ? 1 : 0) + (b.unwrap().granted ? 1 : 0);
        assertEqual(
          successCount,
          1,
          "exactly one of two parallel claims should succeed",
        );
      },
    },
    {
      name: "audit entry created for daily_claim",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);

        const entry = assertOk(
          await economyAuditRepo.create({
            operationType: "daily_claim",
            actorId: userId,
            targetId: userId,
            guildId,
            source: "daily",
            reason: "daily claim",
            currencyData: {
              currencyId: "coins",
              delta: 250,
              beforeBalance: 0,
              afterBalance: 250,
            },
            metadata: { correlationId: `daily_${Date.now()}_test` },
          }),
        );

        assertEqual(
          entry.operationType,
          "daily_claim",
          "operationType should be daily_claim",
        );
        assertEqual(entry.actorId, userId, "actorId should match");
        assertEqual(entry.targetId, userId, "targetId should match");
        assertEqual(entry.currencyData?.delta, 250, "delta should be 250");
      },
    },
    {
      name: "guild daily config persists",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);
        assertOk(await guildEconomyRepo.ensure(guildId));

        const after = assertOk(
          await guildEconomyRepo.updateDailyConfig(guildId, {
            dailyReward: 500,
            dailyCooldownHours: 12,
          }),
        );

        assertEqual(
          after.daily.dailyReward,
          500,
          "daily reward should persist",
        );
        assertEqual(
          after.daily.dailyCooldownHours,
          12,
          "cooldown should persist",
        );
      },
    },
    {
      name: "daily streak bonus caps at configured value",
      ops: [ops.read],
      run: async () => {
        const bonus = computeDailyStreakBonus({
          streak: 15,
          perStreakBonus: 5,
          streakCap: 10,
        });
        assertEqual(bonus, 50, "bonus should cap at 10 days * 5");
      },
    },
    {
      name: "daily audit metadata includes streak fields",
      ops: [ops.read],
      run: async () => {
        const metadata = buildDailyClaimAuditMetadata({
          correlationId: "daily_test_meta",
          fee: 10,
          streakBefore: 2,
          streakAfter: 3,
          bestStreakAfter: 5,
          streakBonus: 15,
          baseReward: 250,
          totalReward: 265,
          netReward: 255,
          feeSector: "tax",
        });

        assertEqual(
          metadata.streakBefore,
          2,
          "streakBefore should be included",
        );
        assertEqual(metadata.streakAfter, 3, "streakAfter should be included");
        assertEqual(metadata.streakBonus, 15, "streakBonus should be included");
      },
    },
  ],
};
