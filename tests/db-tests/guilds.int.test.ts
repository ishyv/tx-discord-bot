import {
  addManagedChannel,
  clearRoleLimit,
  clearRoleOverride,
  deleteGuild,
  ensureGuild,
  ensureRoleExists,
  getCoreChannel,
  getGuild,
  getPendingTickets,
  getRole,
  getRoleLimits,
  getRoleOverrides,
  listManagedChannels,
  readChannels,
  readFeatures,
  readRoles,
  removeManagedChannel,
  removeRole,
  resetRoleOverrides,
  setAllFeatures,
  setCoreChannel,
  setFeature,
  setPendingTickets,
  setRoleLimit,
  setRoleOverride,
  setTicketCategory,
  setTicketMessage,
  updateGuild,
  updateGuildPaths,
  updateManagedChannel,
  updateRole,
  writeChannels,
  writeRoles,
} from "../../src/db/repositories/guilds";
import { Features } from "../../src/db/schemas/guild";
import {
  assert,
  assertDeepEqual,
  assertEqual,
  ops,
  type Suite,
} from "./_utils";

const cleanupGuild = (cleanup: { add: (task: () => Promise<void> | void) => void }, id: string) => {
  cleanup.add(async () => {
    await deleteGuild(id);
  });
};

export const suite: Suite = {
  name: "guilds repo",
  tests: [
    {
      name: "ensure/get and update",
      ops: [ops.create, ops.read, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);

        const missing = await getGuild(guildId);
        assertEqual(missing, null, "getGuild should return null when missing");

        const ensured = await ensureGuild(guildId);
        assertEqual(ensured._id, guildId, "ensureGuild should create guild");

        const updated = await updateGuild(guildId, {
          forumAutoReply: { forumIds: ["forum-1", "forum-2"] },
          reputation: { keywords: ["alpha", "beta"] },
          ai: { provider: "gemini", model: "gemini-2.5-flash" },
        });
        assertDeepEqual(
          updated.forumAutoReply.forumIds,
          ["forum-1", "forum-2"],
          "updateGuild should apply forumAutoReply",
        );
        assertDeepEqual(
          updated.reputation.keywords,
          ["alpha", "beta"],
          "updateGuild should apply reputation",
        );
      },
    },
    {
      name: "update paths and concurrency",
      ops: [ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);
        await ensureGuild(guildId);

        await updateGuildPaths(guildId, {
          "channels.core.logs": { channelId: "log-1" },
          "features.tops": false,
          "channels.ticketCategoryId": "cat-1",
        });

        await Promise.all([
          updateGuildPaths(guildId, { "channels.core.reports": { channelId: "rep-1" } }),
          updateGuildPaths(guildId, { "channels.core.suggestions": { channelId: "sug-1" } }),
        ]);

        const afterPaths = await getGuild(guildId);
        assert(
          afterPaths?.channels.core?.logs?.channelId === "log-1",
          "updateGuildPaths should set core channel",
        );
        assert(
          afterPaths?.channels.core?.reports?.channelId === "rep-1",
          "updateGuildPaths should allow concurrent updates",
        );
        assert(
          afterPaths?.channels.core?.suggestions?.channelId === "sug-1",
          "updateGuildPaths should allow concurrent updates",
        );
        assert(
          afterPaths?.features.tops === false,
          "updateGuildPaths should set feature",
        );

        await updateGuildPaths(guildId, {}, { unset: ["channels.ticketCategoryId"] });
        const afterUnset = await getGuild(guildId);
        assertEqual(
          afterUnset?.channels.ticketCategoryId ?? null,
          null,
          "updateGuildPaths should unset path",
        );
      },
    },
    {
      name: "features",
      ops: [ops.read, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);
        await ensureGuild(guildId);

        const features = await readFeatures(guildId);
        assert(
          typeof features[Features.Tickets] === "boolean",
          "readFeatures should return defaults",
        );

        const toggled = await setFeature(guildId, Features.Tickets, false);
        assertEqual(toggled[Features.Tickets], false, "setFeature should toggle flag");

        const allEnabled = await setAllFeatures(guildId, true);
        assert(
          Object.values(allEnabled).every((value) => value === true),
          "setAllFeatures should enable all",
        );
      },
    },
    {
      name: "channels",
      ops: [ops.read, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);
        await ensureGuild(guildId);

        const channels = await readChannels(guildId);
        assert(channels.core !== undefined, "readChannels should return core map");

        const written = await writeChannels(guildId, (current) => ({
          ...current,
          ticketHelperRoles: ["role-1", "role-1", "role-2"],
          ticketMessageId: "ticket-msg",
        }));
        assertDeepEqual(
          written.ticketHelperRoles,
          ["role-1", "role-2"],
          "writeChannels should dedupe ticket helpers",
        );
        const invalidHelpers = await writeChannels(guildId, (current) => ({
          ...current,
          ticketHelperRoles: ["role-1", 123 as unknown as string],
        }));
        assertDeepEqual(
          invalidHelpers.ticketHelperRoles,
          [],
          "invalid helpers should fallback to default",
        );
        assertEqual(
          written.ticketMessageId,
          "ticket-msg",
          "writeChannels should set ticket message",
        );

        await setCoreChannel(guildId, "welcome", "chan-welcome");
        const core = await getCoreChannel(guildId, "welcome");
        assertEqual(
          core?.channelId ?? null,
          "chan-welcome",
          "setCoreChannel should persist",
        );

        const afterCategory = await setTicketCategory(guildId, "cat-2");
        assertEqual(
          afterCategory.ticketCategoryId ?? null,
          "cat-2",
          "setTicketCategory should persist",
        );

        const afterMessage = await setTicketMessage(guildId, "msg-2");
        assertEqual(
          afterMessage.ticketMessageId ?? null,
          "msg-2",
          "setTicketMessage should persist",
        );
      },
    },
    {
      name: "managed channels",
      ops: [ops.create, ops.update, ops.delete, ops.list],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);
        await ensureGuild(guildId);

        const before = await listManagedChannels(guildId);
        assertEqual(before.length, 0, "listManagedChannels should start empty");

        await addManagedChannel(guildId, {
          label: "Announcements",
          channelId: "chan-1",
        });

        const afterAdd = await listManagedChannels(guildId);
        assertEqual(afterAdd.length, 1, "addManagedChannel should add entry");
        const managedKey = afterAdd[0].id;

        await updateManagedChannel(guildId, "Announcements", { label: "News" });
        const afterUpdate = await listManagedChannels(guildId);
        assertEqual(afterUpdate[0].label, "News", "updateManagedChannel should update label");

        await updateManagedChannel(guildId, managedKey, { channelId: "chan-2" });
        const afterUpdateById = await listManagedChannels(guildId);
        assertEqual(
          afterUpdateById[0].channelId,
          "chan-2",
          "updateManagedChannel should update by id",
        );

        await removeManagedChannel(guildId, managedKey);
        const afterRemove = await listManagedChannels(guildId);
        assertEqual(afterRemove.length, 0, "removeManagedChannel should remove entry");
      },
    },
    {
      name: "pending tickets",
      ops: [ops.read, ops.update],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);
        await ensureGuild(guildId);

        const pending = await getPendingTickets(guildId);
        assertEqual(pending.length, 0, "getPendingTickets should default empty");

        const updatedPending = await setPendingTickets(guildId, (tickets) =>
          tickets.concat(["a", "a", "b", 123 as unknown as string]),
        );
        assertDeepEqual(updatedPending, ["a", "b"], "setPendingTickets should sanitize");
      },
    },
    {
      name: "roles, overrides, and limits",
      ops: [ops.create, ops.read, ops.update, ops.delete],
      run: async ({ factory, cleanup }) => {
        const guildId = factory.guildId();
        cleanupGuild(cleanup, guildId);
        await ensureGuild(guildId);

        const roles = await readRoles(guildId);
        assertEqual(Object.keys(roles).length, 0, "readRoles should start empty");

        const record = {
          label: "Mod",
          discordRoleId: "role-1",
          limits: {},
          reach: {},
          updatedBy: null,
          updatedAt: null,
        };

        const afterWrite = await writeRoles(guildId, (current) => ({
          ...current,
          mod: record,
        }));
        assert(afterWrite.mod?.label === "Mod", "writeRoles should persist role");

        const gotRole = await getRole(guildId, "mod");
        assert(gotRole?.label === "Mod", "getRole should return role");

        const afterUpdate = await updateRole(guildId, "mod", {
          label: "Moderator",
          updatedBy: "admin",
        });
        assertEqual(afterUpdate.mod.label, "Moderator", "updateRole should patch role");
        assert(
          typeof afterUpdate.mod.updatedAt === "string",
          "updateRole should set updatedAt",
        );

        const afterRemove = await removeRole(guildId, "mod");
        assert(afterRemove.mod === undefined, "removeRole should drop role");

        await ensureRoleExists(guildId, "helper");
        const helper = await getRole(guildId, "helper");
        assert(helper !== null, "ensureRoleExists should create role");

        await setRoleOverride(guildId, "helper", "Kick User", "deny");
        const overrides = await getRoleOverrides(guildId, "helper");
        assertEqual(
          (overrides as any)["kick_user"],
          "deny",
          "setRoleOverride should normalize key",
        );

        const overrideRemoved = await clearRoleOverride(guildId, "helper", "Kick User");
        assertEqual(overrideRemoved, true, "clearRoleOverride should remove");

        await resetRoleOverrides(guildId, "helper");
        const overridesAfterReset = await getRoleOverrides(guildId, "helper");
        assertDeepEqual(overridesAfterReset, {}, "resetRoleOverrides should clear map");

        await setRoleLimit(guildId, "helper", "Ban User", {
          limit: 2,
          window: "1h",
          windowSeconds: 3600,
        });
        const limits = await getRoleLimits(guildId, "helper");
        assertEqual(
          (limits as any)["ban_user"]?.limit,
          2,
          "setRoleLimit should persist",
        );

        const limitRemoved = await clearRoleLimit(guildId, "helper", "Ban User");
        assertEqual(limitRemoved, true, "clearRoleLimit should remove");
      },
    },
    {
      name: "delete guild idempotency",
      ops: [ops.delete],
      run: async ({ factory }) => {
        const guildId = factory.guildId();
        await ensureGuild(guildId);

        const deleted = await deleteGuild(guildId);
        assertEqual(deleted, true, "deleteGuild should delete");

        const deletedAgain = await deleteGuild(guildId);
        assertEqual(deletedAgain, false, "deleteGuild should be idempotent");
      },
    },
  ],
};
