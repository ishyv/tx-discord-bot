/**
 * Economy Database Indexes.
 *
 * Purpose: Define and ensure indexes for all economy collections.
 * Encaje: Centralized index management with TTL support.
 *
 * Design:
 * - Each collection exports an ensureIndexes() function
 * - TTL indexes are commented out by default (opt-in)
 * - Index names follow convention: {field}_{field}_idx or {field}_ttl_idx
 * - All functions are idempotent (safe to call multiple times)
 */

import type { Collection, Document } from "mongodb";
import { MongoStore } from "@/db/mongo-store";
import { GuildStore, UserStore } from "@/db/repositories";
import { z } from "zod";

// ============================================================================
// Configuration
// ============================================================================

/** TTL configuration for ephemeral collections.
 * Set to null to disable TTL (default).
 * Uncomment and set duration to enable automatic cleanup.
 */
export const TTLConfig = {
  /** Daily claims: keep for 90 days (users care about streaks) */
  // dailyClaimsSeconds: 60 * 60 * 24 * 90, // 90 days
  dailyClaimsSeconds: null as number | null,

  /** Work claims: keep for 30 days (short-term tracking) */
  // workClaimsSeconds: 60 * 60 * 24 * 30, // 30 days
  workClaimsSeconds: null as number | null,

  /** Votes: keep for 180 days (6 months of voting history) */
  // votesSeconds: 60 * 60 * 24 * 180, // 180 days
  votesSeconds: null as number | null,

  /** Minigame state: embedded in UserStore, no separate TTL */
  minigameStateSeconds: null as number | null,
} as const;

// ============================================================================
// Helper Types
// ============================================================================

type IndexSpec = {
  keys: Record<string, 1 | -1>;
  options: {
    name: string;
    expireAfterSeconds?: number;
    [key: string]: unknown;
  };
};

// ============================================================================
// Daily Claims Indexes (collection: economy_daily_claims)
// ============================================================================

const DailyClaimSchema = z.object({
  _id: z.string(),
  guildId: z.string(),
  userId: z.string(),
  lastClaimAt: z.coerce.date(),
  lastClaimDayStamp: z.number().int(),
  currentStreak: z.number().int(),
  bestStreak: z.number().int(),
});

const DailyClaimStore = new MongoStore(
  "economy_daily_claims",
  DailyClaimSchema as z.ZodType<Document & { _id: string }>,
);

const dailyClaimsIndexes: IndexSpec[] = [
  // Primary lookup by guild+user (compound for efficient queries)
  { keys: { guildId: 1, userId: 1 }, options: { name: "guild_user_idx" } },

  // Time-based queries (leaderboards, streak analysis)
  { keys: { lastClaimAt: -1 }, options: { name: "lastClaim_time_idx" } },
  {
    keys: { guildId: 1, lastClaimAt: -1 },
    options: { name: "guild_lastClaim_idx" },
  },

  // Streak-based queries (for streak leaderboards)
  { keys: { currentStreak: -1 }, options: { name: "streak_idx" } },
  { keys: { bestStreak: -1 }, options: { name: "bestStreak_idx" } },
];

export async function ensureDailyClaimsIndexes(): Promise<void> {
  const col = await DailyClaimStore.collection();

  for (const idx of dailyClaimsIndexes) {
    await col.createIndex(idx.keys, idx.options);
  }

  // Optional TTL index (disabled by default)
  if (TTLConfig.dailyClaimsSeconds) {
    await col.createIndex(
      { lastClaimAt: 1 },
      {
        name: "lastClaim_ttl_idx",
        expireAfterSeconds: TTLConfig.dailyClaimsSeconds,
      },
    );
  }

  console.log("[EconomyDB] Daily claims indexes ensured");
}

// ============================================================================
// Work Claims Indexes (collection: economy_work_claims)
// ============================================================================

const WorkClaimSchema = z.object({
  _id: z.string(),
  guildId: z.string(),
  userId: z.string(),
  lastWorkAt: z.coerce.date(),
  workCountToday: z.number().int(),
  dayStamp: z.string(),
});

const WorkClaimStore = new MongoStore(
  "economy_work_claims",
  WorkClaimSchema as z.ZodType<Document & { _id: string }>,
);

const workClaimsIndexes: IndexSpec[] = [
  // Primary lookup by guild+user
  { keys: { guildId: 1, userId: 1 }, options: { name: "guild_user_idx" } },

  // Time-based queries
  { keys: { lastWorkAt: -1 }, options: { name: "lastWork_time_idx" } },
  {
    keys: { guildId: 1, lastWorkAt: -1 },
    options: { name: "guild_lastWork_idx" },
  },

  // Day stamp queries (for daily aggregation)
  { keys: { dayStamp: 1 }, options: { name: "dayStamp_idx" } },
  {
    keys: { guildId: 1, dayStamp: 1 },
    options: { name: "guild_dayStamp_idx" },
  },
];

export async function ensureWorkClaimsIndexes(): Promise<void> {
  const col = await WorkClaimStore.collection();

  for (const idx of workClaimsIndexes) {
    await col.createIndex(idx.keys, idx.options);
  }

  // Optional TTL index
  if (TTLConfig.workClaimsSeconds) {
    await col.createIndex(
      { lastWorkAt: 1 },
      {
        name: "lastWork_ttl_idx",
        expireAfterSeconds: TTLConfig.workClaimsSeconds,
      },
    );
  }

  console.log("[EconomyDB] Work claims indexes ensured");
}

// ============================================================================
// Voting Indexes (collection: votes)
// ============================================================================

async function getVotesCollection(): Promise<Collection<Document>> {
  const guildCol = await GuildStore.collection();
  return guildCol.db.collection("votes");
}

const votingIndexes: IndexSpec[] = [
  // Primary vote lookups by guild+target (for "who voted for me")
  {
    keys: { guildId: 1, targetId: 1, timestamp: -1 },
    options: { name: "guild_target_time_idx" },
  },

  // Vote lookups by guild+voter (for "who did I vote for")
  {
    keys: { guildId: 1, voterId: 1, timestamp: -1 },
    options: { name: "guild_voter_time_idx" },
  },

  // Individual lookups
  {
    keys: { targetId: 1, timestamp: -1 },
    options: { name: "target_time_idx" },
  },
  { keys: { voterId: 1, timestamp: -1 }, options: { name: "voter_time_idx" } },

  // Type-filtered queries
  {
    keys: { guildId: 1, type: 1, timestamp: -1 },
    options: { name: "guild_type_time_idx" },
  },

  // Correlation tracking
  { keys: { correlationId: 1 }, options: { name: "correlation_idx" } },

  // Timestamp-only for recent votes
  { keys: { timestamp: -1 }, options: { name: "time_idx" } },
];

export async function ensureVotingIndexes(): Promise<void> {
  const col = await getVotesCollection();

  for (const idx of votingIndexes) {
    await col.createIndex(idx.keys, idx.options);
  }

  // Optional TTL index
  if (TTLConfig.votesSeconds) {
    await col.createIndex(
      { timestamp: 1 },
      {
        name: "timestamp_ttl_idx",
        expireAfterSeconds: TTLConfig.votesSeconds,
      },
    );
  }

  console.log("[EconomyDB] Voting indexes ensured");
}

// ============================================================================
// Minigame State Indexes
// ============================================================================

/** Minigame state is stored embedded in users collection.
 * We ensure indexes on the UserStore for minigame queries.
 */
export async function ensureMinigameStateIndexes(): Promise<void> {
  const col = await UserStore.collection();

  // Index for minigame state lookups (sparse because not all users have minigames)
  await col.createIndex(
    { "minigames.coinflip.lastPlayAt": -1 },
    { name: "minigames_coinflip_time_idx", sparse: true },
  );
  await col.createIndex(
    { "minigames.trivia.lastPlayAt": -1 },
    { name: "minigames_trivia_time_idx", sparse: true },
  );
  await col.createIndex(
    { "minigames.rob.lastAttemptAt": -1 },
    { name: "minigames_rob_time_idx", sparse: true },
  );

  // Compound indexes for guild-scoped minigame queries
  await col.createIndex(
    { guildId: 1, "minigames.coinflip.dailyCount": -1 },
    { name: "guild_coinflip_daily_idx", sparse: true },
  );

  console.log("[EconomyDB] Minigame state indexes ensured");
}

// ============================================================================
// Perks Indexes (collection: economy_perks)
// ============================================================================

const PerkStateSchema = z.object({
  _id: z.string(),
  guildId: z.string(),
  userId: z.string(),
  levels: z.record(z.string(), z.number()),
  purchasedAt: z.record(z.string(), z.coerce.date()),
  updatedAt: z.coerce.date(),
});

const PerkStateStore = new MongoStore(
  "economy_perks",
  PerkStateSchema as z.ZodType<Document & { _id: string }>,
);

const perkStateIndexes: IndexSpec[] = [
  // Primary lookup by guild+user
  { keys: { guildId: 1, userId: 1 }, options: { name: "guild_user_idx" } },

  // Guild-wide perk listings
  {
    keys: { guildId: 1, updatedAt: -1 },
    options: { name: "guild_updated_idx" },
  },

  // User's perks across guilds
  { keys: { userId: 1, updatedAt: -1 }, options: { name: "user_updated_idx" } },
];

export async function ensurePerkStateIndexes(): Promise<void> {
  const col = await PerkStateStore.collection();

  for (const idx of perkStateIndexes) {
    await col.createIndex(idx.keys, idx.options);
  }

  console.log("[EconomyDB] Perk state indexes ensured");
}

// ============================================================================
// Equipment Indexes
// ============================================================================

/** Equipment is stored embedded in users collection.
 * Ensure indexes for equipment lookups.
 */
export async function ensureEquipmentIndexes(): Promise<void> {
  const col = await UserStore.collection();

  // Index for equipped items lookup (sparse because not all users have equipment)
  await col.createIndex(
    { "equipment.equipped.itemId": 1 },
    { name: "equipment_item_idx", sparse: true },
  );

  // Index for equipment slots
  await col.createIndex(
    { "equipment.equipped.slot": 1 },
    { name: "equipment_slot_idx", sparse: true },
  );

  console.log("[EconomyDB] Equipment indexes ensured");
}

// ============================================================================
// Crafting Indexes (collection: economy_crafting)
// ============================================================================

const CraftingStateSchema = z.object({
  _id: z.string(),
  guildId: z.string(),
  userId: z.string(),
  recipesUnlocked: z.array(z.string()),
  craftCount: z.record(z.string(), z.number()),
  lastCraftAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const CraftingStateStore = new MongoStore(
  "economy_crafting",
  CraftingStateSchema as z.ZodType<Document & { _id: string }>,
);

const craftingStateIndexes: IndexSpec[] = [
  // Primary lookup by guild+user
  { keys: { guildId: 1, userId: 1 }, options: { name: "guild_user_idx" } },

  // Guild-wide activity
  {
    keys: { guildId: 1, lastCraftAt: -1 },
    options: { name: "guild_lastCraft_idx" },
  },

  // Recent crafters
  { keys: { lastCraftAt: -1 }, options: { name: "lastCraft_time_idx" } },
];

export async function ensureCraftingIndexes(): Promise<void> {
  const col = await CraftingStateStore.collection();

  for (const idx of craftingStateIndexes) {
    await col.createIndex(idx.keys, idx.options);
  }

  console.log("[EconomyDB] Crafting indexes ensured");
}

// ============================================================================
// Store Indexes
// ============================================================================

/** Store catalog is stored in guilds collection.
 * Ensure indexes for store queries.
 */
export async function ensureStoreIndexes(): Promise<void> {
  const col = await GuildStore.collection();

  // Index for store catalog lookups
  await col.createIndex(
    { "store.catalog.updatedAt": -1 },
    { name: "store_catalog_updated_idx", sparse: true },
  );

  console.log("[EconomyDB] Store indexes ensured");
}

// ============================================================================
// Achievements Indexes (collections: achievements_unlocked, achievements_progress, achievements_cosmetics)
// ============================================================================

const AchievementUnlockedSchema = z.object({
  _id: z.string(),
  userId: z.string(),
  guildId: z.string(),
  achievementId: z.string(),
  unlockedAt: z.coerce.date(),
  rewardsClaimed: z.boolean(),
  rewardsClaimedAt: z.coerce.date().optional(),
});

const AchievementProgressSchema = z.object({
  _id: z.string(),
  userId: z.string(),
  guildId: z.string(),
  achievementId: z.string(),
  progress: z.number(),
  target: z.number(),
  completed: z.boolean(),
  updatedAt: z.coerce.date(),
});

const AchievementCosmeticsSchema = z.object({
  _id: z.string(),
  userId: z.string(),
  guildId: z.string(),
  equippedTitle: z
    .object({
      titleId: z.string(),
      titleName: z.string(),
      prefix: z.string().optional(),
      suffix: z.string().optional(),
      equippedAt: z.coerce.date(),
    })
    .optional(),
  titles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      sourceAchievementId: z.string(),
    }),
  ),
  badges: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      emoji: z.string(),
      sourceAchievementId: z.string(),
    }),
  ),
  badgeSlots: z.tuple([
    z.string().nullable(),
    z.string().nullable(),
    z.string().nullable(),
  ]),
});

const AchievementUnlockedStore = new MongoStore(
  "achievements_unlocked",
  AchievementUnlockedSchema as z.ZodType<Document & { _id: string }>,
);

const AchievementProgressStore = new MongoStore(
  "achievements_progress",
  AchievementProgressSchema as z.ZodType<Document & { _id: string }>,
);

const AchievementCosmeticsStore = new MongoStore(
  "achievements_cosmetics",
  AchievementCosmeticsSchema as z.ZodType<Document & { _id: string }>,
);

const achievementsUnlockedIndexes: IndexSpec[] = [
  // Primary lookup by user+guild+achievement
  {
    keys: { userId: 1, guildId: 1, achievementId: 1 },
    options: { name: "user_guild_achievement_idx" },
  },
  // Guild-wide unlock stats
  {
    keys: { guildId: 1, unlockedAt: -1 },
    options: { name: "guild_unlocked_idx" },
  },
  // User's unlocked achievements
  {
    keys: { userId: 1, guildId: 1, unlockedAt: -1 },
    options: { name: "user_guild_time_idx" },
  },
  // Pending rewards (rewardsClaimed: false)
  {
    keys: { userId: 1, guildId: 1, rewardsClaimed: 1 },
    options: { name: "user_guild_claimed_idx" },
  },
];

const achievementsProgressIndexes: IndexSpec[] = [
  // Primary lookup by user+guild+achievement
  {
    keys: { userId: 1, guildId: 1, achievementId: 1 },
    options: { name: "user_guild_achievement_idx" },
  },
  // Guild progress stats
  {
    keys: { guildId: 1, updatedAt: -1 },
    options: { name: "guild_updated_idx" },
  },
  // Find achievements close to completion
  {
    keys: { userId: 1, guildId: 1, completed: 1, progress: -1 },
    options: { name: "user_guild_completed_progress_idx" },
  },
];

const achievementsCosmeticsIndexes: IndexSpec[] = [
  // Primary lookup by user+guild
  { keys: { userId: 1, guildId: 1 }, options: { name: "user_guild_idx" } },
  // Guild title leaderboards
  {
    keys: { guildId: 1, "titles.unlockedAt": -1 },
    options: { name: "guild_titles_idx" },
  },
];

export async function ensureAchievementsIndexes(): Promise<void> {
  const unlockedCol = await AchievementUnlockedStore.collection();
  const progressCol = await AchievementProgressStore.collection();
  const cosmeticsCol = await AchievementCosmeticsStore.collection();

  for (const idx of achievementsUnlockedIndexes) {
    await unlockedCol.createIndex(idx.keys, idx.options);
  }

  for (const idx of achievementsProgressIndexes) {
    await progressCol.createIndex(idx.keys, idx.options);
  }

  for (const idx of achievementsCosmeticsIndexes) {
    await cosmeticsCol.createIndex(idx.keys, idx.options);
  }

  console.log("[EconomyDB] Achievements indexes ensured");
}

// ============================================================================
// Master Index Management
// ============================================================================

/**
 * Ensure all economy database indexes.
 * Call this once at application startup.
 */
export async function ensureAllEconomyIndexes(): Promise<void> {
  const errors: Error[] = [];

  const tasks = [
    { name: "daily claims", fn: ensureDailyClaimsIndexes },
    { name: "work claims", fn: ensureWorkClaimsIndexes },
    { name: "voting", fn: ensureVotingIndexes },
    { name: "minigame state", fn: ensureMinigameStateIndexes },
    { name: "perk state", fn: ensurePerkStateIndexes },
    { name: "equipment", fn: ensureEquipmentIndexes },
    { name: "crafting", fn: ensureCraftingIndexes },
    { name: "store", fn: ensureStoreIndexes },
    { name: "achievements", fn: ensureAchievementsIndexes },
  ];

  for (const task of tasks) {
    try {
      await task.fn();
    } catch (error) {
      console.error(
        `[EconomyDB] Failed to ensure ${task.name} indexes:`,
        error,
      );
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  if (errors.length > 0) {
    console.warn(
      `[EconomyDB] ${errors.length} index operations failed. App can still function.`,
    );
  } else {
    console.log("[EconomyDB] All economy indexes ensured successfully");
  }
}

/**
 * Get index statistics for all economy collections.
 * Useful for monitoring and debugging.
 */
export async function getEconomyIndexStats(): Promise<Record<string, unknown>> {
  const guildCol = await GuildStore.collection();
  const userCol = await UserStore.collection();
  const dailyCol = await DailyClaimStore.collection();
  const workCol = await WorkClaimStore.collection();
  const votesCol = await getVotesCollection();
  const perkCol = await PerkStateStore.collection();
  const craftingCol = await CraftingStateStore.collection();
  const unlockedCol = await AchievementUnlockedStore.collection();
  const progressCol = await AchievementProgressStore.collection();
  const cosmeticsCol = await AchievementCosmeticsStore.collection();

  const stats = await Promise.all([
    guildCol.indexes().catch(() => []),
    userCol.indexes().catch(() => []),
    dailyCol.indexes().catch(() => []),
    workCol.indexes().catch(() => []),
    votesCol.indexes().catch(() => []),
    perkCol.indexes().catch(() => []),
    craftingCol.indexes().catch(() => []),
    unlockedCol.indexes().catch(() => []),
    progressCol.indexes().catch(() => []),
    cosmeticsCol.indexes().catch(() => []),
  ]);

  return {
    guilds: stats[0].map((i) => ({ name: i.name ?? "unknown", key: i.key })),
    users: stats[1].map((i) => ({ name: i.name ?? "unknown", key: i.key })),
    dailyClaims: stats[2].map((i) => ({
      name: i.name ?? "unknown",
      key: i.key,
    })),
    workClaims: stats[3].map((i) => ({
      name: i.name ?? "unknown",
      key: i.key,
    })),
    votes: stats[4].map((i) => ({ name: i.name ?? "unknown", key: i.key })),
    perks: stats[5].map((i) => ({ name: i.name ?? "unknown", key: i.key })),
    crafting: stats[6].map((i) => ({ name: i.name ?? "unknown", key: i.key })),
    achievementsUnlocked: stats[7].map((i) => ({
      name: i.name ?? "unknown",
      key: i.key,
    })),
    achievementsProgress: stats[8].map((i) => ({
      name: i.name ?? "unknown",
      key: i.key,
    })),
    achievementsCosmetics: stats[9].map((i) => ({
      name: i.name ?? "unknown",
      key: i.key,
    })),
  };
}
