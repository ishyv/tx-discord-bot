/**
 * Progression Integration Tests.
 *
 * Tests:
 * - XP adds correctly and level boundaries are respected
 * - Configurable XP rates
 * - Audit entry creation
 */

import * as UsersRepo from "../../src/db/repositories/users";
import * as GuildsRepo from "../../src/db/repositories/guilds";
import {
  progressionService,
  progressionRepo,
  guildEconomyRepo,
  economyAuditRepo,
  getLevelFromXP,
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
  name: "progression",
  tests: [
    {
      name: "adds XP and updates level",
      ops: [ops.create, ops.update, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        assertOk(await guildEconomyRepo.ensure(guildId));
        assertOk(await UsersRepo.ensureUser(userId));

        const correlationId = `xp_${Date.now()}`;
        const addResult = await progressionService.addXP({
          guildId,
          userId,
          sourceOp: "daily_claim",
          amount: 300,
          correlationId,
        });

        const grant = assertOk(addResult);
        assertEqual(grant.afterXP, 300, "XP should increase by amount");
        assertEqual(
          grant.afterLevel,
          getLevelFromXP(300),
          "level should match XP",
        );
        assertEqual(grant.leveledUp, true, "should level up from level 1");

        const state = assertOk(await progressionRepo.getState(guildId, userId));
        assertEqual(state.totalXP, 300, "state should persist XP");

        const audit = assertOk(
          await economyAuditRepo.query({
            guildId,
            targetId: userId,
            operationType: "xp_grant",
            correlationId,
          }),
        );
        assert(audit.entries.length > 0, "should write xp_grant audit entry");
      },
    },
    {
      name: "supports configurable XP rates",
      ops: [ops.update, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        const ensured = assertOk(await guildEconomyRepo.ensure(guildId));
        const update = await guildEconomyRepo.updateProgressionConfig(guildId, {
          xpAmounts: { daily_claim: 123 },
          cooldownSeconds: { daily_claim: 0 },
        });
        assertOk(update);

        assertOk(await UsersRepo.ensureUser(userId));
        const config = assertOk(await guildEconomyRepo.findByGuildId(guildId));
        assertEqual(
          config?.progression.xpAmounts.daily_claim,
          123,
          "xp amount should update",
        );

        const addResult = await progressionService.addXP({
          guildId,
          userId,
          sourceOp: "daily_claim",
          amount: config!.progression.xpAmounts.daily_claim,
        });

        const grant = assertOk(addResult);
        assertEqual(grant.afterXP, 123, "XP should use configured amount");
        assertEqual(
          grant.afterLevel,
          getLevelFromXP(123),
          "level should follow configured amount",
        );
        assertEqual(
          ensured.progression.enabled,
          true,
          "progression should be enabled by default",
        );
      },
    },
  ],
};
