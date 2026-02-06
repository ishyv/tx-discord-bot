/**
 * Marketplace integration tests.
 */

import * as UsersRepo from "../../src/db/repositories/users";
import * as GuildsRepo from "../../src/db/repositories/guilds";
import {
  assert,
  assertEqual,
  assertOk,
  type Suite,
  ops,
} from "./_utils";
import { marketRepository, marketService } from "../../src/modules/market";
import { economyAccountRepo } from "../../src/modules/economy";

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

const coins = (hand: number) => ({
  coins: {
    hand,
    bank: 0,
    use_total_on_subtract: false,
  },
});

const getQty = (inventory: unknown, itemId: string): number => {
  const entry = (inventory as Record<string, any> | undefined)?.[itemId];
  if (!entry) return 0;
  if (typeof entry.quantity === "number") return entry.quantity;
  if (entry.type === "stackable" && typeof entry.quantity === "number") {
    return entry.quantity;
  }
  if (entry.type === "instances" && Array.isArray(entry.instances)) {
    return entry.instances.length;
  }
  return 0;
};

async function setAccountStatus(
  userId: string,
  status: "ok" | "blocked" | "banned",
): Promise<void> {
  const ensured = assertOk(await economyAccountRepo.ensure(userId));
  const updated = await economyAccountRepo.updateStatus(
    userId,
    status,
    ensured.account.version,
  );
  assert(updated.isOk(), "account status update should succeed");
}

export const suite: Suite = {
  name: "marketplace",
  tests: [
    {
      name: "listing escrow removes seller inventory",
      ops: [ops.create, ops.update, ops.service],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const sellerId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, sellerId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(sellerId);
        assertOk(await economyAccountRepo.ensure(sellerId));

        await UsersRepo.saveUser(sellerId, {
          inventory: {
            stone: { type: "stackable", quantity: 10 },
          } as any,
          currency: coins(0) as any,
        } as any);

        const list = await marketService.listItem({
          guildId,
          sellerId,
          itemId: "stone",
          quantity: 10,
          pricePerUnit: 12,
        });
        assert(list.isOk(), "listing should succeed");

        const seller = assertOk(await UsersRepo.findUser(sellerId));
        const qty = getQty(seller?.inventory, "stone");
        assertEqual(qty, 0, "seller stone should be escrowed");

        const listing = assertOk(
          await marketRepository.findById(list.unwrap().listingId),
        );
        assert(listing, "listing should exist");
        assertEqual(listing!.quantity, 10, "listing qty should be 10");
      },
    },
    {
      name: "buy success transfers item and currency",
      ops: [ops.create, ops.update, ops.service],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const sellerId = factory.userId();
        const buyerId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, sellerId);
        cleanupUser(cleanup, buyerId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(sellerId);
        await UsersRepo.ensureUser(buyerId);
        assertOk(await economyAccountRepo.ensure(sellerId));
        assertOk(await economyAccountRepo.ensure(buyerId));

        await UsersRepo.saveUser(sellerId, {
          inventory: {
            stone: { type: "stackable", quantity: 10 },
          } as any,
          currency: coins(0) as any,
        } as any);
        await UsersRepo.saveUser(buyerId, {
          inventory: {} as any,
          currency: coins(1000) as any,
        } as any);

        const listed = assertOk(
          await marketService.listItem({
            guildId,
            sellerId,
            itemId: "stone",
            quantity: 10,
            pricePerUnit: 12,
          }),
        );

        const bought = await marketService.buyListing({
          guildId,
          buyerId,
          listingId: listed.listingId,
          quantity: 5,
        });
        assert(bought.isOk(), "buy should succeed");
        assertEqual(bought.unwrap().subtotal, 60, "subtotal mismatch");

        const buyer = assertOk(await UsersRepo.findUser(buyerId));
        const seller = assertOk(await UsersRepo.findUser(sellerId));
        const listing = assertOk(await marketRepository.findById(listed.listingId));

        assertEqual(
          getQty(buyer?.inventory, "stone"),
          5,
          "buyer should receive 5 stone",
        );
        assertEqual(
          (seller?.currency as any)?.coins?.hand ?? 0,
          60,
          "seller should receive payout",
        );
        assertEqual(listing?.quantity ?? -1, 5, "listing should have 5 remaining");
      },
    },
    {
      name: "capacity failure keeps listing and currency unchanged",
      ops: [ops.create, ops.update, ops.service],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const sellerId = factory.userId();
        const buyerId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, sellerId);
        cleanupUser(cleanup, buyerId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(sellerId);
        await UsersRepo.ensureUser(buyerId);
        assertOk(await economyAccountRepo.ensure(sellerId));
        assertOk(await economyAccountRepo.ensure(buyerId));

        await UsersRepo.saveUser(sellerId, {
          inventory: {
            stone: { type: "stackable", quantity: 1 },
          } as any,
          currency: coins(0) as any,
        } as any);
        await UsersRepo.saveUser(buyerId, {
          inventory: {
            stone: { type: "stackable", quantity: 100 },
          } as any,
          currency: coins(1000) as any,
        } as any);

        const listed = assertOk(
          await marketService.listItem({
            guildId,
            sellerId,
            itemId: "stone",
            quantity: 1,
            pricePerUnit: 10,
          }),
        );

        const buy = await marketService.buyListing({
          guildId,
          buyerId,
          listingId: listed.listingId,
          quantity: 1,
        });

        assert(buy.isErr(), "buy should fail by capacity");
        if (buy.isErr()) {
          assertEqual(
            (buy.error as any).code,
            "CAPACITY_EXCEEDED",
            "error should be capacity",
          );
        }

        const buyer = assertOk(await UsersRepo.findUser(buyerId));
        const listing = assertOk(await marketRepository.findById(listed.listingId));
        assertEqual(
          (buyer?.currency as any)?.coins?.hand ?? 0,
          1000,
          "buyer currency must remain",
        );
        assertEqual(listing?.quantity ?? -1, 1, "listing should remain intact");
      },
    },
    {
      name: "concurrency: only one buyer wins quantity 1",
      ops: [ops.create, ops.update, ops.service],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const sellerId = factory.userId();
        const buyerA = factory.userId();
        const buyerB = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, sellerId);
        cleanupUser(cleanup, buyerA);
        cleanupUser(cleanup, buyerB);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(sellerId);
        await UsersRepo.ensureUser(buyerA);
        await UsersRepo.ensureUser(buyerB);
        assertOk(await economyAccountRepo.ensure(sellerId));
        assertOk(await economyAccountRepo.ensure(buyerA));
        assertOk(await economyAccountRepo.ensure(buyerB));

        await UsersRepo.saveUser(sellerId, {
          inventory: { stone: { type: "stackable", quantity: 1 } } as any,
          currency: coins(0) as any,
        } as any);
        await UsersRepo.saveUser(buyerA, { currency: coins(500) as any } as any);
        await UsersRepo.saveUser(buyerB, { currency: coins(500) as any } as any);

        const listed = assertOk(
          await marketService.listItem({
            guildId,
            sellerId,
            itemId: "stone",
            quantity: 1,
            pricePerUnit: 10,
          }),
        );

        const [a, b] = await Promise.all([
          marketService.buyListing({
            guildId,
            buyerId: buyerA,
            listingId: listed.listingId,
            quantity: 1,
          }),
          marketService.buyListing({
            guildId,
            buyerId: buyerB,
            listingId: listed.listingId,
            quantity: 1,
          }),
        ]);

        const successCount = Number(a.isOk()) + Number(b.isOk());
        assertEqual(successCount, 1, "exactly one buyer must succeed");

        const listing = assertOk(await marketRepository.findById(listed.listingId));
        assertEqual(listing?.quantity ?? -1, 0, "listing must be depleted");

        const userA = assertOk(await UsersRepo.findUser(buyerA));
        const userB = assertOk(await UsersRepo.findUser(buyerB));
        const totalOwned =
          getQty(userA?.inventory, "stone") + getQty(userB?.inventory, "stone");
        assertEqual(totalOwned, 1, "only one stone should be distributed");
      },
    },
    {
      name: "cancel listing returns escrow to seller",
      ops: [ops.create, ops.update, ops.service],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const sellerId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, sellerId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(sellerId);
        assertOk(await economyAccountRepo.ensure(sellerId));

        await UsersRepo.saveUser(sellerId, {
          inventory: { stone: { type: "stackable", quantity: 4 } } as any,
          currency: coins(0) as any,
        } as any);

        const listed = assertOk(
          await marketService.listItem({
            guildId,
            sellerId,
            itemId: "stone",
            quantity: 4,
            pricePerUnit: 8,
          }),
        );

        const cancelled = await marketService.cancelListing({
          guildId,
          actorId: sellerId,
          listingId: listed.listingId,
        });
        assert(cancelled.isOk(), "cancel should succeed");

        const seller = assertOk(await UsersRepo.findUser(sellerId));
        const listing = assertOk(await marketRepository.findById(listed.listingId));
        assertEqual(
          getQty(seller?.inventory, "stone"),
          4,
          "seller inventory should be restored",
        );
        assertEqual(listing?.status ?? "", "cancelled", "listing should be cancelled");
      },
    },
    {
      name: "gating blocks blocked/banned users from trading",
      ops: [ops.create, ops.update, ops.service],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const sellerId = factory.userId();
        const buyerId = factory.userId();
        cleanupGuild(cleanup, guildId);
        cleanupUser(cleanup, sellerId);
        cleanupUser(cleanup, buyerId);

        await GuildsRepo.ensureGuild(guildId);
        await UsersRepo.ensureUser(sellerId);
        await UsersRepo.ensureUser(buyerId);
        assertOk(await economyAccountRepo.ensure(sellerId));
        assertOk(await economyAccountRepo.ensure(buyerId));

        await UsersRepo.saveUser(sellerId, {
          inventory: { stone: { type: "stackable", quantity: 2 } } as any,
          currency: coins(0) as any,
        } as any);
        await UsersRepo.saveUser(buyerId, {
          inventory: {} as any,
          currency: coins(100) as any,
        } as any);

        await setAccountStatus(sellerId, "blocked");
        const blockedList = await marketService.listItem({
          guildId,
          sellerId,
          itemId: "stone",
          quantity: 1,
          pricePerUnit: 10,
        });
        assert(blockedList.isErr(), "blocked seller should not list");
        if (blockedList.isErr()) {
          assertEqual((blockedList.error as any).code, "ACCOUNT_BLOCKED");
        }

        await setAccountStatus(sellerId, "ok");
        const listed = assertOk(
          await marketService.listItem({
            guildId,
            sellerId,
            itemId: "stone",
            quantity: 1,
            pricePerUnit: 10,
          }),
        );

        await setAccountStatus(buyerId, "banned");
        const bannedBuy = await marketService.buyListing({
          guildId,
          buyerId,
          listingId: listed.listingId,
          quantity: 1,
        });
        assert(bannedBuy.isErr(), "banned buyer should not buy");
        if (bannedBuy.isErr()) {
          assertEqual((bannedBuy.error as any).code, "ACCOUNT_BANNED");
        }
      },
    },
  ],
};
