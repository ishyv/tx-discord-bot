/**
 * RPG Config Integration Tests.
 *
 * Tests:
 * - Config persistence (combat, processing, gathering, upgrades)
 * - Default values
 * - Audit entry creation on config update
 * - Enable/disable RPG system
 */

import * as GuildsRepo from "../../src/db/repositories/guilds";
import { rpgConfigRepo, rpgConfigService } from "../../src/modules/rpg/config";
import { economyAuditRepo } from "../../src/modules/economy/audit/repository";
import { assert, assertEqual, assertOk, ops, type Suite } from "./_utils";

const cleanupGuild = (
  cleanup: { add: (task: () => Promise<void> | void) => void },
  id: string,
) => {
  cleanup.add(async () => {
    await GuildsRepo.deleteGuild(id);
  });
};

export const suite: Suite = {
  name: "rpg config",
  tests: [
    {
      name: "config persistence: default values",
      ops: [ops.create, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);
        const config = assertOk(await rpgConfigRepo.ensure(guildId));

        // Combat defaults
        assertEqual(config.combat.critChance, 0.15, "default crit chance should be 15%");
        assertEqual(config.combat.blockChance, 0.25, "default block chance should be 25%");
        assertEqual(config.combat.timeoutSeconds, 300, "default timeout should be 300s");

        // Processing defaults
        assertEqual(config.processing.baseSuccessChance, 0.6, "default success chance should be 60%");
        assertEqual(config.processing.feePercent, 0.05, "default fee should be 5%");

        // Gathering defaults
        assertEqual(config.gathering.durabilityMin, 8, "default durability min should be 8");
        assertEqual(config.gathering.yieldMax, 3, "default yield max should be 3");

        // Upgrade defaults
        assertEqual(config.upgrades.maxTier, 4, "default max tier should be 4");
        assert(config.upgrades.costs.tier2, "should have tier2 cost");
      },
    },
    {
      name: "config persistence: combat update",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);
        assertOk(await rpgConfigRepo.ensure(guildId));

        const after = assertOk(
          await rpgConfigRepo.updateCombatConfig(guildId, {
            critChance: 0.25,
            blockChance: 0.35,
            timeoutSeconds: 600,
          }),
        );

        assertEqual(after.combat.critChance, 0.25, "crit chance should persist");
        assertEqual(after.combat.blockChance, 0.35, "block chance should persist");
        assertEqual(after.combat.timeoutSeconds, 600, "timeout should persist");
      },
    },
    {
      name: "config persistence: processing update",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);
        assertOk(await rpgConfigRepo.ensure(guildId));

        const after = assertOk(
          await rpgConfigRepo.updateProcessingConfig(guildId, {
            baseSuccessChance: 0.75,
            luckCap: 0.3,
            feePercent: 0.1,
          }),
        );

        assertEqual(after.processing.baseSuccessChance, 0.75, "success chance should persist");
        assertEqual(after.processing.luckCap, 0.3, "luck cap should persist");
        assertEqual(after.processing.feePercent, 0.1, "fee percent should persist");
      },
    },
    {
      name: "config persistence: gathering update",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);
        assertOk(await rpgConfigRepo.ensure(guildId));

        const after = assertOk(
          await rpgConfigRepo.updateGatheringConfig(guildId, {
            durabilityMin: 5,
            durabilityMax: 15,
            yieldMin: 2,
            yieldMax: 5,
            tierBonusPerLevel: 1.0,
          }),
        );

        assertEqual(after.gathering.durabilityMin, 5, "durability min should persist");
        assertEqual(after.gathering.durabilityMax, 15, "durability max should persist");
        assertEqual(after.gathering.yieldMin, 2, "yield min should persist");
        assertEqual(after.gathering.tierBonusPerLevel, 1.0, "tier bonus should persist");
      },
    },
    {
      name: "config persistence: upgrades update",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);
        assertOk(await rpgConfigRepo.ensure(guildId));

        const newCosts = {
          tier2: { money: 1000, materials: [{ id: "copper_ore", quantity: 10 }] },
        };

        const after = assertOk(
          await rpgConfigRepo.updateUpgradeConfig(guildId, {
            costs: newCosts,
            maxTier: 5,
            resetDurabilityOnUpgrade: false,
          }),
        );

        assertEqual(after.upgrades.maxTier, 5, "max tier should persist");
        assertEqual(after.upgrades.resetDurabilityOnUpgrade, false, "reset durability flag should persist");
        assertEqual(after.upgrades.costs.tier2.money, 1000, "custom cost should persist");
      },
    },
    {
      name: "config update creates audit entry via service",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const actorId = factory.userId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);
        assertOk(await rpgConfigRepo.ensure(guildId));

        // Use service to trigger audit
        assertOk(
          await rpgConfigService.updateCombatConfig(
            guildId,
            actorId,
            { critChance: 0.3 },
            { reason: "Test combat config update", correlationId: "test-correlation-123" },
          ),
        );

        // Query audit
        const auditResult = assertOk(
          await economyAuditRepo.query({ guildId, operationType: "config_update" }),
        );

        assert(auditResult.entries.length > 0, "should have audit entries");
        const entry = auditResult.entries.find((e) => e.metadata?.category === "combat");
        assert(entry, "should have combat config audit entry");
        assertEqual(entry.metadata?.field, "critChance", "audit should record field");
        assertEqual(entry.metadata?.after, 0.3, "audit should record new value");
        assertEqual(entry.actorId, actorId, "audit should record actor");
      },
    },
    {
      name: "enable/disable RPG system",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);
        const config = assertOk(await rpgConfigRepo.ensure(guildId));
        assertEqual(config.enabled, true, "RPG should be enabled by default");

        const disabled = assertOk(await rpgConfigRepo.setEnabled(guildId, false));
        assertEqual(disabled.enabled, false, "RPG should be disabled");

        const enabled = assertOk(await rpgConfigRepo.setEnabled(guildId, true));
        assertEqual(enabled.enabled, true, "RPG should be re-enabled");
      },
    },
    {
      name: "config values are clamped to valid ranges",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);
        assertOk(await rpgConfigRepo.ensure(guildId));

        // Try to set invalid values
        const after = assertOk(
          await rpgConfigRepo.updateCombatConfig(guildId, {
            critChance: 1.5, // Should be clamped to 1.0
            blockChance: -0.5, // Should be clamped to 0.0
            timeoutSeconds: 10, // Should be clamped to 30
          }),
        );

        assertEqual(after.combat.critChance, 1.0, "crit chance should be clamped to max 1.0");
        assertEqual(after.combat.blockChance, 0.0, "block chance should be clamped to min 0.0");
        assertEqual(after.combat.timeoutSeconds, 30, "timeout should be clamped to min 30");
      },
    },
    {
      name: "get returns null for non-existent guild",
      ops: [ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        // Don't create guild, just try to get config
        const result = assertOk(await rpgConfigRepo.get(guildId));
        assertEqual(result, null, "should return null for non-existent guild");
      },
    },
    {
      name: "ensure creates default config for new guild",
      ops: [ops.create, ops.upsert],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        await GuildsRepo.ensureGuild(guildId);
        
        // First ensure should create defaults
        const config1 = assertOk(await rpgConfigRepo.ensure(guildId));
        assertEqual(config1.enabled, true, "should create with enabled=true");
        assertEqual(config1.combat.critChance, 0.15, "should create with default combat values");

        // Second ensure should return existing
        const config2 = assertOk(await rpgConfigRepo.ensure(guildId));
        assertEqual(config2.combat.critChance, 0.15, "should return existing config");
      },
    },
  ],
};
