import {
  createOffer,
  findActiveByAuthor,
  findById,
  listByStatus,
  removeOffer,
  updateOffer,
} from "../../src/db/repositories/offers";
import type { OfferDetails } from "../../src/db/schemas/offers";
import {
  assert,
  assertEqual,
  assertErr,
  assertOk,
  ops,
  withConsoleMuted,
  type Suite,
} from "./_utils";

const cleanupOffer = (cleanup: { add: (task: () => Promise<void> | void) => void }, id: string) => {
  cleanup.add(async () => {
    const res = await removeOffer(id);
    if (res.isErr()) return;
  });
};

export const suite: Suite = {
  name: "offers repo",
  tests: [
    {
      name: "create/find/update",
      ops: [ops.create, ops.read, ops.update],
      run: async ({ factory, cleanup }) => {
        const offerId = factory.offerId();
        const guildId = factory.guildId();
        const authorId = factory.userId();
        cleanupOffer(cleanup, offerId);

        const details: OfferDetails = {
          title: "Test Offer",
          description: factory.sentence(10),
          requirements: null,
          workMode: null,
          duration: null,
          salary: null,
          contact: null,
          labels: ["test"],
          location: null,
        };

        const created = assertOk(
          await createOffer({
            id: offerId,
            guildId,
            authorId,
            details,
            embed: { source: "test" },
            reviewMessageId: null,
            reviewChannelId: null,
          }),
        );
        assertEqual(created._id, offerId, "createOffer should persist");

        const found = assertOk(await findById(offerId));
        assert(found !== null && found._id === offerId, "findById should return offer");

        const active = assertOk(await findActiveByAuthor(guildId, authorId));
        assert(
          active !== null && active._id === offerId,
          "findActiveByAuthor should return offer",
        );

        const updated = assertOk(
          await updateOffer(
            offerId,
            {
              status: "APPROVED",
              publishedMessageId: "msg-1",
              publishedChannelId: "chan-1",
            },
            { allowedFrom: ["PENDING_REVIEW"] },
          ),
        );
        assert(updated !== null && updated.status === "APPROVED", "updateOffer should update");

        const blocked = assertOk(
          await updateOffer(
            offerId,
            { status: "WITHDRAWN" },
            { allowedFrom: ["PENDING_REVIEW"] },
          ),
        );
        assertEqual(blocked, null, "updateOffer should honor allowedFrom");

        const notActive = assertOk(await findActiveByAuthor(guildId, authorId));
        assertEqual(notActive, null, "findActiveByAuthor should ignore non-active offers");
      },
    },
    {
      name: "duplicate active offer prevention",
      ops: [ops.create],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const authorId = factory.userId();
        const offerId = factory.offerId();
        const offerIdTwo = factory.offerId();
        cleanupOffer(cleanup, offerId);
        cleanupOffer(cleanup, offerIdTwo);

        const details: OfferDetails = {
          title: "Primary",
          description: factory.sentence(6),
          requirements: null,
          workMode: null,
          duration: null,
          salary: null,
          contact: null,
          labels: [],
          location: null,
        };

        assertOk(
          await createOffer({
            id: offerId,
            guildId,
            authorId,
            details,
            embed: { source: "test" },
            reviewMessageId: null,
            reviewChannelId: null,
          }),
        );

        await withConsoleMuted(["error"], async () => {
          const dup = await createOffer({
            id: offerIdTwo,
            guildId,
            authorId,
            details,
            embed: { source: "test" },
            reviewMessageId: null,
            reviewChannelId: null,
          });
          const err = assertErr(dup);
          assert(
            err.message === "ACTIVE_OFFER_EXISTS",
            "duplicate active offers should return ACTIVE_OFFER_EXISTS",
          );
        });
      },
    },
    {
      name: "list and remove",
      ops: [ops.list, ops.delete],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        const authorId = factory.userId();
        const offerId = factory.offerId();
        cleanupOffer(cleanup, offerId);

        const details: OfferDetails = {
          title: "Listable",
          description: factory.sentence(5),
          requirements: null,
          workMode: null,
          duration: null,
          salary: null,
          contact: null,
          labels: ["demo"],
          location: null,
        };

        assertOk(
          await createOffer({
            id: offerId,
            guildId,
            authorId,
            details,
            embed: { source: "test" },
            reviewMessageId: null,
            reviewChannelId: null,
          }),
        );

        await updateOffer(offerId, { status: "APPROVED" });

        const listed = assertOk(await listByStatus(guildId, ["APPROVED", "REJECTED"]));
        assert(
          listed.some((offer) => offer._id === offerId),
          "listByStatus should include offer",
        );

        const empty = assertOk(await listByStatus(guildId, ["INVALID" as any]));
        assertEqual(empty.length, 0, "listByStatus should filter invalid statuses");

        const removed = assertOk(await removeOffer(offerId));
        assertEqual(removed, true, "removeOffer should delete");

        const removedAgain = assertOk(await removeOffer(offerId));
        assertEqual(removedAgain, false, "removeOffer should be idempotent");
      },
    },
    {
      name: "update non-existent offer",
      ops: [ops.update],
      run: async ({ factory }) => {
        const missing = assertOk(
          await updateOffer(factory.offerId(), { status: "REJECTED" }),
        );
        assertEqual(missing, null, "updateOffer should return null when missing");
      },
    },
  ],
};
