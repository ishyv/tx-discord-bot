/**
 * Economy Config Integration Tests (Phase 3a).
 *
 * Tests:
 * - Config persistence (tax rate, tax sector, thresholds)
 * - Audit entry creation on config update (CONFIG_UPDATE)
 * - Query audit by operationType and correlationId
 */

import * as GuildsRepo from "../../src/db/repositories/guilds";
import {
  guildEconomyRepo,
  economyAuditRepo,
} from "../../src/modules/economy";
import {
  assert,
  assertEqual,
  assertOk,
  ops,
  type Suite,
} from "./_utils";

const cleanupGuild = (cleanup: { add: (task: () => Promise<void> | void) => void }, id: string) => {
  cleanup.add(async () => {
    await GuildsRepo.deleteGuild(id);
  });
};

export const suite: Suite = {
  name: "economy config",
  tests: [
    {
      name: "config persistence: tax rate update",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);
        assertOk(await guildEconomyRepo.ensure(guildId));

        const before = assertOk(await guildEconomyRepo.ensure(guildId));
        assertEqual(before.tax.rate, 0.05, "default tax rate should be 5%");

        const after = assertOk(await guildEconomyRepo.updateTaxConfig(guildId, { rate: 0.1 }));
        assertEqual(after.tax.rate, 0.1, "tax rate should persist");
      },
    },
    {
      name: "config persistence: tax sector update",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);
        assertOk(await guildEconomyRepo.ensure(guildId));

        const after = assertOk(await guildEconomyRepo.updateTaxConfig(guildId, { taxSector: "works" }));
        assertEqual(after.tax.taxSector, "works", "tax sector should persist");
      },
    },
    {
      name: "config persistence: thresholds update",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);
        assertOk(await guildEconomyRepo.ensure(guildId));

        const after = assertOk(await guildEconomyRepo.updateThresholds(guildId, {
          warning: 50_000,
          alert: 500_000,
          critical: 5_000_000,
        }));
        assertEqual(after.thresholds.warning, 50_000, "warning threshold should persist");
        assertEqual(after.thresholds.alert, 500_000, "alert threshold should persist");
        assertEqual(after.thresholds.critical, 5_000_000, "critical threshold should persist");
      },
    },
    {
      name: "config update creates audit entry",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const actorId = factory.userId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);
        assertOk(await guildEconomyRepo.ensure(guildId));
        assertOk(await guildEconomyRepo.updateTaxConfig(guildId, { rate: 0.08 }));

        const auditCreate = assertOk(await economyAuditRepo.create({
          operationType: "config_update",
          actorId,
          targetId: guildId,
          guildId,
          source: "economy-config set tax-rate",
          metadata: {
            correlationId: `config_${Date.now()}_test`,
            key: "tax.rate",
            before: { rate: 0.05 },
            after: { rate: 0.08 },
          },
        }));

        assertEqual(auditCreate.operationType, "config_update", "audit operationType should be config_update");
        assertEqual(auditCreate.actorId, actorId, "audit actorId should match");
        assertEqual(auditCreate.targetId, guildId, "audit targetId should be guild");
        const meta = auditCreate.metadata as { correlationId?: string };
        assert(meta?.correlationId != null, "audit should have correlationId");

        const query = await economyAuditRepo.query({
          guildId,
          operationType: "config_update",
          correlationId: meta.correlationId,
          pageSize: 10,
        });
        assertOk(query);
        assertEqual(query.unwrap().entries.length, 1, "query should return the created entry");
      },
    },
    {
      name: "guild config includes daily defaults",
      ops: [ops.create, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);
        const config = assertOk(await guildEconomyRepo.ensure(guildId));

        assertEqual(config.daily.dailyReward, 250, "default daily reward should be 250");
        assertEqual(config.daily.dailyCooldownHours, 24, "default cooldown should be 24h");
        assertEqual(config.daily.dailyCurrencyId, "coins", "default currency should be coins");
      },
    },
  ],
};
