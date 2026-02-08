import { getDb } from "@/db/mongo";
import type { GuildId, UserId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type {
  ActiveQuestState,
  QuestHistoryState,
  QuestProgressDoc,
} from "./types";

const COLLECTION = "rpg_quest_progress";

function buildDocId(guildId: GuildId, userId: UserId): string {
  return `${guildId}:${userId}`;
}

function asDate(value: unknown, fallback: Date): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return fallback;
}

function normalizeActiveState(
  questId: string,
  raw: unknown,
  fallbackNow: Date,
): ActiveQuestState {
  const data = (raw ?? {}) as Record<string, unknown>;
  const progress = Array.isArray(data.stepProgress)
    ? data.stepProgress.map((value) =>
      Number.isFinite(value) ? Math.max(0, Math.trunc(Number(value))) : 0,
    )
    : [];

  const inFlightRaw = data.claimInFlight as Record<string, unknown> | undefined;
  const inFlight = inFlightRaw
    ? {
      correlationId: String(inFlightRaw.correlationId ?? ""),
      startedAt: asDate(inFlightRaw.startedAt, fallbackNow),
    }
    : undefined;

  return {
    questId,
    stepProgress: progress,
    acceptedAt: asDate(data.acceptedAt, fallbackNow),
    completedAt: data.completedAt ? asDate(data.completedAt, fallbackNow) : undefined,
    claimedAt: data.claimedAt ? asDate(data.claimedAt, fallbackNow) : undefined,
    claimCorrelationId:
      typeof data.claimCorrelationId === "string"
        ? data.claimCorrelationId
        : undefined,
    claimInFlight:
      inFlight && inFlight.correlationId
        ? {
          correlationId: inFlight.correlationId,
          startedAt: inFlight.startedAt,
        }
        : undefined,
  };
}

function normalizeHistoryState(
  raw: unknown,
  fallbackNow: Date,
): QuestHistoryState {
  const data = (raw ?? {}) as Record<string, unknown>;
  const completedCount = Number.isFinite(data.completedCount)
    ? Math.max(0, Math.trunc(Number(data.completedCount)))
    : 0;

  return {
    completedCount,
    lastCompletedAt: data.lastCompletedAt
      ? asDate(data.lastCompletedAt, fallbackNow)
      : undefined,
    lastClaimedAt: data.lastClaimedAt
      ? asDate(data.lastClaimedAt, fallbackNow)
      : undefined,
    lastClaimCorrelationId:
      typeof data.lastClaimCorrelationId === "string"
        ? data.lastClaimCorrelationId
        : undefined,
  };
}

function normalizeDoc(
  guildId: GuildId,
  userId: UserId,
  raw?: Record<string, unknown> | null,
): QuestProgressDoc {
  const now = new Date();
  const data = raw ?? {};
  const activeRaw = (data.active ?? {}) as Record<string, unknown>;
  const historyRaw = (data.history ?? {}) as Record<string, unknown>;

  const active: Record<string, ActiveQuestState> = {};
  for (const [questId, state] of Object.entries(activeRaw)) {
    active[questId] = normalizeActiveState(questId, state, now);
  }

  const history: Record<string, QuestHistoryState> = {};
  for (const [questId, state] of Object.entries(historyRaw)) {
    history[questId] = normalizeHistoryState(state, now);
  }

  return {
    _id: String(data._id ?? buildDocId(guildId, userId)),
    guildId,
    userId,
    active,
    history,
    createdAt: asDate(data.createdAt, now),
    updatedAt: asDate(data.updatedAt, now),
  };
}

export interface RpgQuestProgressRepository {
  ensureIndexes(): Promise<void>;
  get(guildId: GuildId, userId: UserId): Promise<Result<QuestProgressDoc, Error>>;
  set(guildId: GuildId, userId: UserId, doc: QuestProgressDoc): Promise<Result<QuestProgressDoc, Error>>;
  getCollection(): Promise<any>;
}

class RpgQuestProgressRepositoryImpl implements RpgQuestProgressRepository {
  async getCollection() {
    const db = await getDb();
    return db.collection(COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    const collection = await this.getCollection();
    await Promise.all([
      collection.createIndex({ guildId: 1, userId: 1 }, { name: "guild_user_idx" }),
      collection.createIndex({ updatedAt: -1 }, { name: "updatedAt_idx" }),
      collection.createIndex({ "active.$**": 1 }, { name: "active_wildcard_idx" }),
    ]);
  }

  async get(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<QuestProgressDoc, Error>> {
    try {
      const collection = await this.getCollection();
      const _id = buildDocId(guildId, userId);
      const doc = await collection.findOne({ _id } as any);

      if (!doc) {
        const now = new Date();
        const initial: QuestProgressDoc = {
          _id,
          guildId,
          userId,
          active: {},
          history: {},
          createdAt: now,
          updatedAt: now,
        };

        await collection.insertOne(initial as any);
        return OkResult(initial);
      }

      return OkResult(normalizeDoc(guildId, userId, doc as Record<string, unknown>));
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async set(
    guildId: GuildId,
    userId: UserId,
    doc: QuestProgressDoc,
  ): Promise<Result<QuestProgressDoc, Error>> {
    try {
      const collection = await this.getCollection();
      const _id = buildDocId(guildId, userId);
      const nextDoc = {
        ...doc,
        _id,
        guildId,
        userId,
        updatedAt: new Date(),
      };

      await collection.replaceOne({ _id } as any, nextDoc as any, { upsert: true });

      return OkResult(normalizeDoc(guildId, userId, nextDoc as Record<string, unknown>));
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export const rpgQuestProgressRepo: RpgQuestProgressRepository =
  new RpgQuestProgressRepositoryImpl();

export { buildDocId as buildQuestProgressDocId };
