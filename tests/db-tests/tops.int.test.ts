import {
  bumpChannelCount,
  bumpEmojiCounts,
  bumpReputationDelta,
  ensureTopWindow,
  findDueWindows,
  getTopWindow,
  listReports,
  persistTopReport,
  resetTopWindow,
  rotateWindowAfterReport,
  updateTopConfig,
} from "@/db/repositories/tops";
import {
  assert,
  assertDeepEqual,
  assertEqual,
  ops,
  type Suite,
} from "./_utils";

export const suite: Suite = {
  name: "tops repo",
  tests: [
    {
      name: "ensure/update config and invalid values",
      ops: [ops.create, ops.read, ops.update],
      run: async ({ factory }) => {
        const guildId = factory.guildId();
        const ensured = await ensureTopWindow(guildId);
        assertEqual(ensured.guildId, guildId, "ensureTopWindow should create window");

        const updated = await updateTopConfig(guildId, {
          channelId: "chan-1",
          intervalMs: 1500.9,
          topSize: 7.7,
        });
        assertEqual(updated.channelId, "chan-1", "updateTopConfig should set channel");
        assertEqual(updated.intervalMs, 1500, "updateTopConfig should truncate interval");
        assertEqual(updated.topSize, 7, "updateTopConfig should truncate topSize");

        const unchanged = await updateTopConfig(guildId, {
          channelId: "",
          intervalMs: -5,
          topSize: NaN,
        });
        assertEqual(unchanged.channelId, null, "empty channelId should reset to null");
        assertEqual(unchanged.intervalMs, 1, "negative interval should clamp to 1");
        assertEqual(unchanged.topSize, 7, "invalid topSize should be ignored");
      },
    },
    {
      name: "bump counts and reset",
      ops: [ops.update, ops.read],
      run: async ({ factory }) => {
        const guildId = factory.guildId();
        await ensureTopWindow(guildId);
        await resetTopWindow(guildId, new Date());

        await Promise.all([
          bumpEmojiCounts(guildId, { smile: 2 }),
          bumpEmojiCounts(guildId, { smile: 1, wow: 3 }),
        ]);
        await Promise.all([
          bumpChannelCount(guildId, "chan-2", 1),
          bumpChannelCount(guildId, "chan-2", 1),
        ]);
        await bumpReputationDelta(guildId, "user-1", 4);

        const window = await getTopWindow(guildId);
        assertEqual(window.emojiCounts.smile, 3, "bumpEmojiCounts should sum");
        assertEqual(window.emojiCounts.wow, 3, "bumpEmojiCounts should include keys");
        assertEqual(window.channelCounts["chan-2"], 2, "bumpChannelCount should sum");
        assertEqual(
          window.reputationDeltas["user-1"],
          4,
          "bumpReputationDelta should increment",
        );

        await bumpChannelCount(guildId, "chan-2", Number.NaN);
        const unchanged = await getTopWindow(guildId);
        assertEqual(
          unchanged.channelCounts["chan-2"],
          2,
          "invalid bump should be ignored",
        );

        const reset = await resetTopWindow(guildId, new Date(Date.now() - 5000));
        assertDeepEqual(reset.emojiCounts, {}, "resetTopWindow should clear emojiCounts");
        assertDeepEqual(
          reset.channelCounts,
          {},
          "resetTopWindow should clear channelCounts",
        );
      },
    },
    {
      name: "due windows and reports",
      ops: [ops.read, ops.update, ops.list, ops.create],
      run: async ({ factory }) => {
        const guildId = factory.guildId();
        await updateTopConfig(guildId, { channelId: "chan-1", intervalMs: 1000, topSize: 5 });
        await resetTopWindow(guildId, new Date(Date.now() - 2000));

        const due = await findDueWindows(new Date());
        assert(
          due.some((entry) => entry.guildId === guildId),
          "findDueWindows should include guild",
        );

        const report = await persistTopReport({
          guildId,
          periodStart: new Date(Date.now() - 1000),
          periodEnd: new Date(),
          intervalMs: 1000,
          emojiCounts: { smile: 1 },
          channelCounts: { "chan-2": 2 },
          reputationDeltas: { "user-1": 3 },
          metadata: { source: "test" },
        });
        assert(report._id.length > 0, "persistTopReport should return id");

        const reports = await listReports(guildId, 5);
        assert(
          reports.some((entry) => entry._id === report._id),
          "listReports should include report",
        );

        await bumpEmojiCounts(guildId, { wave: 1 });
        const rotated = await rotateWindowAfterReport(guildId, new Date());
        assert(rotated !== null, "rotateWindowAfterReport should return window");
        assertDeepEqual(
          rotated?.emojiCounts ?? {},
          {},
          "rotateWindowAfterReport should reset emojiCounts",
        );
      },
    },
  ],
};
