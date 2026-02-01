/**
 * Economy Rollback Integration Tests (Phase 3e).
 *
 * Tests:
 * - rollback restores balances for transfer
 * - rollback restores balances for store buy/sell
 * - rollback restores balances for daily/work claim
 * - rollback audited
 * - rejects invalid correlationId
 */

import * as UsersRepo from "../../src/db/repositories/users";
import * as GuildsRepo from "../../src/db/repositories/guilds";
import {
  economyAccountRepo,
  economyAuditRepo,
  guildEconomyRepo,
  guildEconomyService,
  currencyMutationService,
  itemMutationService,
  storeRepo,
  storeService,
  rollbackByCorrelationId,
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

const getCoinsHand = (user: any): number => {
  const coins = user?.currency?.coins as { hand?: number } | undefined;
  return Number(coins?.hand ?? 0);
};

export const suite: Suite = {
  name: "economy rollback",
  tests: [
    {
      name: "rollback restores balances for transfer",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const senderId = factory.userId();
        const recipientId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, senderId);
        cleanupUser(cleanup, recipientId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(senderId);
        await UsersRepo.ensureUser(recipientId);
        assertOk(await economyAccountRepo.ensure(senderId));
        assertOk(await economyAccountRepo.ensure(recipientId));

        assertOk(
          await currencyMutationService.adjustCurrencyBalance(
            {
              actorId: senderId,
              targetId: senderId,
              guildId,
              currencyId: "coins",
              delta: 500,
              reason: "seed",
            },
            async () => true,
          ),
        );

        const transfer = assertOk(
          await currencyMutationService.transferCurrency({
            senderId,
            recipientId,
            guildId,
            currencyId: "coins",
            amount: 100,
            reason: "test transfer",
          }),
        );

        const rollback = await rollbackByCorrelationId({
          correlationId: transfer.transferId,
          guildId,
          actorId: senderId,
        });
        assertOk(rollback);

        const sender = assertOk(await UsersRepo.findUser(senderId));
        const recipient = assertOk(await UsersRepo.findUser(recipientId));
        assertEqual(
          getCoinsHand(sender),
          500,
          "sender balance should be restored",
        );
        assertEqual(
          getCoinsHand(recipient),
          0,
          "recipient balance should be restored",
        );
      },
    },
    {
      name: "rollback restores store buy/sell",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));
        assertOk(await storeRepo.ensure(guildId));
        assertOk(
          await storeRepo.updateConfig(guildId, { currencyId: "coins" }),
        );
        assertOk(await guildEconomyRepo.ensure(guildId));

        // Seed store item
        assertOk(
          await storeRepo.upsertItem(guildId, {
            itemId: "palo",
            name: "Palo de Madera",
            buyPrice: 100,
            sellPrice: 85,
            stock: 10,
            available: true,
          }),
        );

        // Seed user balance and trade sector liquidity
        assertOk(
          await currencyMutationService.adjustCurrencyBalance(
            {
              actorId: userId,
              targetId: userId,
              guildId,
              currencyId: "coins",
              delta: 1000,
              reason: "seed",
            },
            async () => true,
          ),
        );
        assertOk(
          await guildEconomyService.depositToSector({
            guildId,
            sector: "trade",
            amount: 1000,
            source: "seed",
            reason: "seed liquidity",
          }),
        );

        const beforeUser = assertOk(await UsersRepo.findUser(userId));
        const beforeCoins = getCoinsHand(beforeUser);
        const beforeInventoryQty = Number(
          beforeUser?.inventory?.palo?.quantity ?? 0,
        );
        const beforeGuild = assertOk(await guildEconomyRepo.ensure(guildId));
        const beforeTrade = beforeGuild.sectors.trade;
        const beforeStore = assertOk(await storeRepo.findByGuildId(guildId));
        const beforeStock = beforeStore?.items?.palo?.stock ?? 10;

        const buy = assertOk(
          await storeService.buyItem({
            buyerId: userId,
            guildId,
            itemId: "palo",
            quantity: 1,
            reason: "test buy",
          }),
        );

        assertOk(
          await rollbackByCorrelationId({
            correlationId: buy.transactionId,
            guildId,
            actorId: userId,
          }),
        );

        const afterUser = assertOk(await UsersRepo.findUser(userId));
        const afterCoins = getCoinsHand(afterUser);
        const afterInventoryQty = Number(
          afterUser?.inventory?.palo?.quantity ?? 0,
        );
        const afterGuild = assertOk(await guildEconomyRepo.ensure(guildId));

        assertEqual(
          afterCoins,
          beforeCoins,
          "buy rollback should restore coins",
        );
        assertEqual(
          afterInventoryQty,
          beforeInventoryQty,
          "buy rollback should restore inventory",
        );
        assertEqual(
          afterGuild.sectors.trade,
          beforeTrade,
          "buy rollback should restore trade sector",
        );
        const afterStore = assertOk(await storeRepo.findByGuildId(guildId));
        assertEqual(
          afterStore?.items?.palo?.stock ?? 10,
          beforeStock,
          "buy rollback should restore stock",
        );

        // Grant item for sell test
        assertOk(
          await itemMutationService.adjustItemQuantity(
            {
              actorId: userId,
              targetId: userId,
              guildId,
              itemId: "palo",
              delta: 2,
              reason: "seed items",
              force: true,
            },
            async () => true,
          ),
        );

        const sell = assertOk(
          await storeService.sellItem({
            sellerId: userId,
            guildId,
            itemId: "palo",
            quantity: 1,
            reason: "test sell",
          }),
        );

        assertOk(
          await rollbackByCorrelationId({
            correlationId: sell.transactionId,
            guildId,
            actorId: userId,
          }),
        );

        const afterSellUser = assertOk(await UsersRepo.findUser(userId));
        const afterSellCoins = getCoinsHand(afterSellUser);
        const afterSellInventoryQty = Number(
          afterSellUser?.inventory?.palo?.quantity ?? 0,
        );
        const afterSellGuild = assertOk(await guildEconomyRepo.ensure(guildId));
        const afterSellStore = assertOk(await storeRepo.findByGuildId(guildId));

        assertEqual(
          afterSellInventoryQty,
          2,
          "sell rollback should restore inventory qty",
        );
        assertEqual(
          afterSellCoins,
          afterCoins,
          "sell rollback should restore coins",
        );
        assertEqual(
          afterSellGuild.sectors.trade,
          beforeTrade,
          "sell rollback should restore trade sector",
        );
        assertEqual(
          afterSellStore?.items?.palo?.stock ?? 10,
          beforeStock,
          "sell rollback should restore stock",
        );
      },
    },
    {
      name: "rollback restores daily/work claim",
      ops: [ops.create, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));
        assertOk(await guildEconomyRepo.ensure(guildId));

        const dailyCorrelationId = `daily_${Date.now()}_test`;
        assertOk(
          await currencyMutationService.adjustCurrencyBalance(
            {
              actorId: userId,
              targetId: userId,
              guildId,
              currencyId: "coins",
              delta: 250,
              reason: "daily claim test",
            },
            async () => true,
          ),
        );
        assertOk(
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
            metadata: { correlationId: dailyCorrelationId },
          }),
        );

        assertOk(
          await rollbackByCorrelationId({
            correlationId: dailyCorrelationId,
            guildId,
            actorId: userId,
          }),
        );

        const afterDaily = assertOk(await UsersRepo.findUser(userId));
        assertEqual(
          getCoinsHand(afterDaily),
          0,
          "daily rollback should restore coins",
        );

        const workCorrelationId = `work_${Date.now()}_test`;
        assertOk(
          await guildEconomyService.depositToSector({
            guildId,
            sector: "works",
            amount: 500,
            source: "seed",
            reason: "seed works sector",
          }),
        );
        const sectorBefore = assertOk(await guildEconomyRepo.ensure(guildId))
          .sectors.works;
        const withdraw = assertOk(
          await guildEconomyService.withdrawFromSector({
            guildId,
            sector: "works",
            amount: 120,
            source: "work_payout",
            reason: "work test",
          }),
        );

        assertOk(
          await currencyMutationService.adjustCurrencyBalance(
            {
              actorId: userId,
              targetId: userId,
              guildId,
              currencyId: "coins",
              delta: 120,
              reason: "work claim test",
            },
            async () => true,
          ),
        );

        assertOk(
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
            metadata: {
              correlationId: workCorrelationId,
              sector: "works",
              sectorBefore: withdraw.before,
              sectorAfter: withdraw.after,
            },
          }),
        );

        assertOk(
          await rollbackByCorrelationId({
            correlationId: workCorrelationId,
            guildId,
            actorId: userId,
          }),
        );

        const afterWorkUser = assertOk(await UsersRepo.findUser(userId));
        const afterWorkGuild = assertOk(await guildEconomyRepo.ensure(guildId));
        assertEqual(
          getCoinsHand(afterWorkUser),
          0,
          "work rollback should restore coins",
        );
        assertEqual(
          afterWorkGuild.sectors.works,
          sectorBefore,
          "work rollback should restore works sector",
        );
      },
    },
    {
      name: "rollback audited",
      ops: [ops.create, ops.update, ops.read],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, userId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(userId);
        assertOk(await economyAccountRepo.ensure(userId));

        const correlationId = `daily_${Date.now()}_audit`;
        assertOk(
          await currencyMutationService.adjustCurrencyBalance(
            {
              actorId: userId,
              targetId: userId,
              guildId,
              currencyId: "coins",
              delta: 1,
              reason: "seed daily audit",
            },
            async () => true,
          ),
        );
        assertOk(
          await economyAuditRepo.create({
            operationType: "daily_claim",
            actorId: userId,
            targetId: userId,
            guildId,
            source: "daily",
            reason: "daily claim",
            currencyData: {
              currencyId: "coins",
              delta: 1,
              beforeBalance: 0,
              afterBalance: 1,
            },
            metadata: { correlationId },
          }),
        );

        assertOk(
          await rollbackByCorrelationId({
            correlationId,
            guildId,
            actorId: userId,
          }),
        );

        const auditQuery = await economyAuditRepo.query({
          guildId,
          operationType: "rollback",
          pageSize: 10,
        });
        assertOk(auditQuery);
        const found = auditQuery
          .unwrap()
          .entries.find(
            (entry) =>
              (entry.metadata as any)?.originalCorrelationId === correlationId,
          );
        assert(!!found, "rollback audit entry should exist");
      },
    },
    {
      name: "rejects invalid correlationId",
      ops: [ops.read],
      run: async ({ factory }) => {
        const guildId = factory.guildId();
        const userId = factory.userId();

        const result = await rollbackByCorrelationId({
          correlationId: "does_not_exist",
          guildId,
          actorId: userId,
        });
        assert(result.isErr(), "rollback should reject invalid correlationId");
      },
    },
  ],
};
