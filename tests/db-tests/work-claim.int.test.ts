/**
 * Work Claim Integration Tests (Phase 3d).
 *
 * Tests:
 * - Cooldown blocks repeated use
 * - Daily cap enforced
 * - Concurrency: two parallel claims -> only one grants
 * - Sector insufficient funds behavior
 * - Audit entry created for work_claim and queryable
 */

import * as UsersRepo from "../../src/db/repositories/users";
import * as GuildsRepo from "../../src/db/repositories/guilds";
import {
  workClaimRepo,
  guildEconomyRepo,
  guildEconomyService,
  economyAuditRepo,
  economyAccountRepo,
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
  name: "work claim",
  tests: [
    {
      name: "cooldown blocks repeated use",
      ops: [ops.create, ops.update, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));

        const first = await workClaimRepo.tryClaim(guildId, userId, 30, 5);
        assertOk(first);
        assertEqual(first.unwrap().granted, true, "first work should succeed");

        const second = await workClaimRepo.tryClaim(guildId, userId, 30, 5);
        assertOk(second);
        assertEqual(
          second.unwrap().granted,
          false,
          "second work before cooldown should fail",
        );
        assertEqual(
          second.unwrap().reason,
          "cooldown",
          "reason should be cooldown",
        );
      },
    },
    {
      name: "daily cap enforced",
      ops: [ops.create, ops.update, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));

        const first = await workClaimRepo.tryClaim(guildId, userId, 0, 2);
        const second = await workClaimRepo.tryClaim(guildId, userId, 0, 2);
        const third = await workClaimRepo.tryClaim(guildId, userId, 0, 2);

        assertOk(first);
        assertOk(second);
        assertOk(third);
        assertEqual(first.unwrap().granted, true, "first work should succeed");
        assertEqual(
          second.unwrap().granted,
          true,
          "second work should succeed",
        );
        assertEqual(
          third.unwrap().granted,
          false,
          "third work should hit daily cap",
        );
        assertEqual(third.unwrap().reason, "cap", "reason should be cap");
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
          workClaimRepo.tryClaim(guildId, userId, 30, 5),
          workClaimRepo.tryClaim(guildId, userId, 30, 5),
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
      name: "sector insufficient funds rejects withdraw",
      ops: [ops.create, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);
        assertOk(await guildEconomyRepo.ensure(guildId));

        const withdraw = await guildEconomyService.withdrawFromSector({
          guildId,
          sector: "works",
          amount: 100,
          source: "work_payout_test",
          reason: "test",
        });

        assert(withdraw.isErr(), "withdraw should fail when sector is empty");
      },
    },
    {
      name: "audit entry created for work_claim and queryable",
      ops: [ops.create, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);

        const correlationId = `work_${Date.now()}_test`;
        const entry = assertOk(
          await economyAuditRepo.create({
            operationType: "work_claim",
            actorId: userId,
            targetId: userId,
            guildId,
            source: "work",
            reason: "work claim",
            currencyData: {
              currencyId: "coins",
              delta: 120,
              beforeBalance: 0,
              afterBalance: 120,
            },
            metadata: { correlationId },
          }),
        );

        assertEqual(
          entry.operationType,
          "work_claim",
          "operationType should be work_claim",
        );

        const query = await economyAuditRepo.query({
          guildId,
          operationType: "work_claim",
          correlationId,
          pageSize: 10,
        });
        assertOk(query);
        assertEqual(
          query.unwrap().entries.length,
          1,
          "query should return the created entry",
        );
      },
    },
  ],
};
