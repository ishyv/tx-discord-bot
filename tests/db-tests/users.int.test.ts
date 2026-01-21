import * as UsersRepo from "../../src/db/repositories/users";
import type { Warn } from "../../src/db/schemas/user";
import {
  assert,
  assertDeepEqual,
  assertEqual,
  assertErr,
  assertOk,
  ops,
  withConsoleMuted,
  type Suite,
} from "./_utils";

const buildWarn = (factory: { warnId: () => string; userId: () => string; isoDate: () => string; sentence: (words?: number) => string; }): Warn => ({
  reason: factory.sentence(4),
  warn_id: factory.warnId(),
  moderator: factory.userId(),
  timestamp: factory.isoDate(),
});

const cleanupUser = (cleanup: { add: (task: () => Promise<void> | void) => void }, id: string) => {
  cleanup.add(async () => {
    const res = await UsersRepo.deleteUser(id);
    if (res.isErr()) return;
  });
};

export const suite: Suite = {
  name: "users repo",
  tests: [
    {
      name: "ensure and find user",
      ops: [ops.create, ops.read],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);

        const missing = assertOk(await UsersRepo.findUser(userId));
        assertEqual(missing, null, "findUser should return null when missing");

        const ensured = assertOk(await UsersRepo.ensureUser(userId));
        assertEqual(ensured._id, userId, "ensureUser should create user");

        const found = assertOk(await UsersRepo.findUser(userId));
        assert(found !== null, "findUser should return user");
      },
    },
    {
      name: "save user and invalid patch",
      ops: [ops.update, ops.read],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);
        assertOk(await UsersRepo.ensureUser(userId));

        const saved = assertOk(await UsersRepo.saveUser(userId, { rep: 5 }));
        assertEqual(saved.rep ?? 0, 5, "saveUser should persist rep");

        const coerced = assertOk(await UsersRepo.saveUser(userId, { rep: -2 }));
        assertEqual(coerced.rep ?? 0, 0, "invalid rep should coerce to default");
      },
    },
    {
      name: "register case history",
      ops: [ops.update, ops.read],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        const guildId = factory.guildId();
        cleanupUser(cleanup, userId);

        assertOk(await UsersRepo.registerCase(userId, guildId, "WARN", "case A"));
        assertOk(await UsersRepo.registerCase(userId, guildId, "KICK", "case B"));

        const current = assertOk(await UsersRepo.findUser(userId));
        const history = current?.sanction_history?.[guildId] ?? [];
        assertEqual(history.length, 2, "registerCase should append history entries");
      },
    },
    {
      name: "reputation helpers and concurrency",
      ops: [ops.update, ops.read],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);
        assertOk(await UsersRepo.ensureUser(userId));

        const base = assertOk(await UsersRepo.setUserReputation(userId, 0));
        assertEqual(base, 0, "setUserReputation should set baseline");

        const clamped = assertOk(
          await UsersRepo.updateUserReputation(userId, () => -10),
        );
        assertEqual(clamped, 0, "updateUserReputation should clamp negatives");

        const [a, b] = await Promise.all([
          UsersRepo.adjustUserReputation(userId, 2),
          UsersRepo.adjustUserReputation(userId, 3),
        ]);
        const results = [assertOk(a), assertOk(b)];
        assert(
          results.includes(5),
          "one concurrent update should observe final rep",
        );
        assert(
          results.includes(2) || results.includes(3),
          "one concurrent update should observe intermediate rep",
        );

        const final = assertOk(await UsersRepo.getUserReputation(userId));
        assertEqual(final, 5, "final reputation should match concurrent updates");
      },
    },
    {
      name: "warn lifecycle",
      ops: [ops.create, ops.read, ops.update, ops.delete],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);
        assertOk(await UsersRepo.ensureUser(userId));

        const warnOne = buildWarn(factory);
        const warnTwo = buildWarn(factory);

        const afterAdd = assertOk(await UsersRepo.addWarn(userId, warnOne));
        assert(
          afterAdd.some((warn) => warn.warn_id === warnOne.warn_id),
          "addWarn should add warn",
        );

        const listed = assertOk(await UsersRepo.listWarns(userId));
        assertEqual(listed.length, 1, "listWarns should return warns");

        const afterSet = assertOk(
          await UsersRepo.setWarns(userId, [warnOne, warnTwo]),
        );
        assertEqual(afterSet.length, 2, "setWarns should replace warns");

        const afterRemove = assertOk(
          await UsersRepo.removeWarn(userId, warnOne.warn_id),
        );
        assert(
          !afterRemove.some((warn) => warn.warn_id === warnOne.warn_id),
          "removeWarn should remove warn",
        );

        const afterClear = assertOk(await UsersRepo.clearWarns(userId));
        assertEqual(afterClear.length, 0, "clearWarns should empty warns");

        await withConsoleMuted(["error"], async () => {
          const invalidWarn = {
            reason: "missing id",
            moderator: factory.userId(),
            timestamp: factory.isoDate(),
          } as unknown as Warn;
          const err = assertErr(await UsersRepo.addWarn(userId, invalidWarn));
          assert(err instanceof Error, "addWarn invalid should return error");
          assertEqual(err.name, "ZodError", "addWarn invalid should be ZodError");
        });
      },
    },
    {
      name: "open tickets and limits",
      ops: [ops.read, ops.update],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        const userIdTwo = factory.userId();
        const sharedChannel = factory.channelId();
        cleanupUser(cleanup, userId);
        cleanupUser(cleanup, userIdTwo);

        const initial = assertOk(await UsersRepo.listOpenTickets(userId));
        assertEqual(initial.length, 0, "listOpenTickets should default empty");

        const sanitized = assertOk(
          await UsersRepo.setOpenTickets(userId, [
            sharedChannel,
            sharedChannel,
            123 as unknown as string,
          ]),
        );
        assertDeepEqual(
          sanitized,
          [sharedChannel],
          "setOpenTickets should sanitize",
        );

        const addedOnce = assertOk(
          await UsersRepo.addOpenTicket(userId, "chan-extra"),
        );
        assert(addedOnce.includes("chan-extra"), "addOpenTicket should add");

        const addedAgain = assertOk(
          await UsersRepo.addOpenTicket(userId, "chan-extra"),
        );
        assertEqual(
          addedAgain.filter((id) => id === "chan-extra").length,
          1,
          "addOpenTicket should be idempotent",
        );

        const removed = assertOk(
          await UsersRepo.removeOpenTicket(userId, "chan-extra"),
        );
        assert(
          !removed.includes("chan-extra"),
          "removeOpenTicket should remove",
        );

        assertOk(await UsersRepo.setOpenTickets(userId, []));
        const limitTrue = assertOk(
          await UsersRepo.addOpenTicketIfBelowLimit(userId, "limit-1", 1),
        );
        assertEqual(limitTrue, true, "should add when under limit");

        const limitFalse = assertOk(
          await UsersRepo.addOpenTicketIfBelowLimit(userId, "limit-2", 1),
        );
        assertEqual(limitFalse, false, "should reject when at limit");

        const limitSame = assertOk(
          await UsersRepo.addOpenTicketIfBelowLimit(userId, "limit-1", 1),
        );
        assertEqual(limitSame, true, "should return true for existing channel");

        const limitInvalid = assertOk(
          await UsersRepo.addOpenTicketIfBelowLimit(userId, "limit-3", 0),
        );
        assertEqual(limitInvalid, false, "should reject invalid limit");

        assertOk(await UsersRepo.setOpenTickets(userId, [sharedChannel]));
        assertOk(await UsersRepo.setOpenTickets(userIdTwo, [sharedChannel]));
        assertOk(await UsersRepo.removeOpenTicketByChannel(sharedChannel));

        const afterOne = assertOk(await UsersRepo.listOpenTickets(userId));
        const afterTwo = assertOk(await UsersRepo.listOpenTickets(userIdTwo));
        assert(
          !afterOne.includes(sharedChannel),
          "removeOpenTicketByChannel should remove from user",
        );
        assert(
          !afterTwo.includes(sharedChannel),
          "removeOpenTicketByChannel should remove from other user",
        );

        const noOp = assertOk(await UsersRepo.removeOpenTicketByChannel(""));
        assertEqual(noOp, undefined, "removeOpenTicketByChannel empty should no-op");
      },
    },
    {
      name: "inventory and currency CAS",
      ops: [ops.update],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);
        assertOk(await UsersRepo.ensureUser(userId));
        assertOk(await UsersRepo.saveUser(userId, { inventory: {}, currency: {} }));

        const inventoryUpdated = assertOk(
          await UsersRepo.replaceInventoryIfMatch(userId, {}, { potion: 1 }),
        );
        assert(
          inventoryUpdated !== null &&
            (inventoryUpdated.inventory as any)?.potion === 1,
          "replaceInventoryIfMatch should update",
        );

        const inventoryMismatch = assertOk(
          await UsersRepo.replaceInventoryIfMatch(userId, {}, { potion: 2 }),
        );
        assertEqual(
          inventoryMismatch,
          null,
          "replaceInventoryIfMatch should reject mismatches",
        );

        const currencyUpdated = assertOk(
          await UsersRepo.replaceCurrencyIfMatch(userId, {}, { gold: 10 }),
        );
        assert(
          currencyUpdated !== null &&
            (currencyUpdated.currency as any)?.gold === 10,
          "replaceCurrencyIfMatch should update",
        );

        const currencyMismatch = assertOk(
          await UsersRepo.replaceCurrencyIfMatch(userId, {}, { gold: 20 }),
        );
        assertEqual(
          currencyMismatch,
          null,
          "replaceCurrencyIfMatch should reject mismatches",
        );
      },
    },
    {
      name: "toUser tolerant parsing",
      ops: [ops.read],
      run: async ({ factory }) => {
        const valid = UsersRepo.toUser({ _id: factory.userId() });
        assert(valid !== null, "toUser should parse valid doc");

        await withConsoleMuted(["error"], async () => {
          const invalid = UsersRepo.toUser({ nope: true });
          assert(
            invalid !== null && invalid._id === "unknown",
            "toUser should fallback to defaults",
          );
        });
      },
    },
    {
      name: "delete user idempotency",
      ops: [ops.delete],
      run: async ({ factory, cleanup }) => {
        const userId = factory.userId();
        cleanupUser(cleanup, userId);
        assertOk(await UsersRepo.ensureUser(userId));

        const deleted = assertOk(await UsersRepo.deleteUser(userId));
        assertEqual(deleted, true, "deleteUser should delete existing user");

        const deletedAgain = assertOk(await UsersRepo.deleteUser(userId));
        assertEqual(deletedAgain, false, "deleteUser should be idempotent");
      },
    },
  ],
};
