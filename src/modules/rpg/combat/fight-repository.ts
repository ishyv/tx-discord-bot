/**
 * RPG Fight Repository.
 *
 * Purpose: Persistence layer for combat fights with TTL support.
 * Context: MongoDB collection rpg_fights with optimistic concurrency.
 */

import { getDb } from "@/db/mongo";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { RpgFightData, FightRound, CombatMove, FightPlayerSnapshot } from "./fight-schema";
import { RpgFightSchema } from "./fight-schema";

const COLLECTION_NAME = "rpg_fights";

/** Query filter for fights. */
export interface FightQuery {
  status?: "pending" | "active" | "completed" | "expired" | "forfeited";
  p1Id?: string;
  p2Id?: string;
  userId?: string; // Either p1 or p2
}

/** Repository interface. */
export interface RpgFightRepo {
  /** Get Mongo collection (for direct operations). */
  collection(): Promise<import("mongodb").Collection<RpgFightData>>;

  /** Ensure TTL index exists. */
  ensureIndexes(): Promise<void>;

  /** Create new fight. */
  create(fight: RpgFightData): Promise<Result<RpgFightData, Error>>;

  /** Find by ID. */
  findById(fightId: string): Promise<Result<RpgFightData | null, Error>>;

  /** Find active fight for user. */
  findActiveByUser(userId: string): Promise<Result<RpgFightData | null, Error>>;

  /** Find pending challenge sent to user. */
  findPendingChallenge(userId: string): Promise<Result<RpgFightData | null, Error>>;

  /** Accept fight - atomically set snapshots and status. */
  accept(
    fightId: string,
    p1Snapshot: FightPlayerSnapshot,
    p2Snapshot: FightPlayerSnapshot,
  ): Promise<Result<RpgFightData | null, Error>>;

  /** Submit move for a player. */
  submitMove(
    fightId: string,
    playerId: string,
    move: CombatMove,
  ): Promise<Result<RpgFightData | null, Error>>;

  /** Resolve round with both moves. */
  resolveRound(
    fightId: string,
    round: FightRound,
    newP1Hp: number,
    newP2Hp: number,
  ): Promise<Result<RpgFightData | null, Error>>;

  /** Complete fight with winner. */
  complete(
    fightId: string,
    winnerId: string,
  ): Promise<Result<RpgFightData | null, Error>>;

  /** Mark as expired. */
  expire(fightId: string): Promise<Result<RpgFightData | null, Error>>;

  /** Forfeit fight. */
  forfeit(fightId: string, forfeiterId: string): Promise<Result<RpgFightData | null, Error>>;

  /** List fights with pagination. */
  list(query: FightQuery, page: number, pageSize: number): Promise<Result<RpgFightData[], Error>>;

  /** Clean up old fights manually (for testing). */
  deleteById(fightId: string): Promise<Result<boolean, Error>>;
}

class RpgFightRepoImpl implements RpgFightRepo {
  async collection(): Promise<import("mongodb").Collection<RpgFightData>> {
    const db = await getDb();
    return db.collection<RpgFightData>(COLLECTION_NAME);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.collection();
    
    // TTL index on expiresAt for automatic cleanup
    await col.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "ttl_expiresAt" }
    );
    
    // Query indexes
    await col.createIndex({ p1Id: 1, status: 1 }, { name: "p1_status" });
    await col.createIndex({ p2Id: 1, status: 1 }, { name: "p2_status" });
    await col.createIndex({ status: 1, expiresAt: 1 }, { name: "status_expires" });
  }

  async create(fight: RpgFightData): Promise<Result<RpgFightData, Error>> {
    try {
      const col = await this.collection();
      await col.insertOne(fight);
      return OkResult(fight);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findById(fightId: string): Promise<Result<RpgFightData | null, Error>> {
    try {
      const col = await this.collection();
      const doc = await col.findOne({ _id: fightId });
      if (!doc) return OkResult(null);
      
      const parsed = RpgFightSchema.safeParse(doc);
      if (!parsed.success) {
        return ErrResult(new Error(`Corrupted fight data: ${parsed.error.message}`));
      }
      return OkResult(parsed.data);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findActiveByUser(userId: string): Promise<Result<RpgFightData | null, Error>> {
    try {
      const col = await this.collection();
      const doc = await col.findOne({
        status: "active",
        $or: [{ p1Id: userId }, { p2Id: userId }],
      });
      if (!doc) return OkResult(null);
      
      const parsed = RpgFightSchema.safeParse(doc);
      if (!parsed.success) {
        return ErrResult(new Error(`Corrupted fight data: ${parsed.error.message}`));
      }
      return OkResult(parsed.data);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findPendingChallenge(userId: string): Promise<Result<RpgFightData | null, Error>> {
    try {
      const col = await this.collection();
      const doc = await col.findOne({
        status: "pending",
        p2Id: userId,
      });
      if (!doc) return OkResult(null);
      
      const parsed = RpgFightSchema.safeParse(doc);
      if (!parsed.success) {
        return ErrResult(new Error(`Corrupted fight data: ${parsed.error.message}`));
      }
      return OkResult(parsed.data);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async accept(
    fightId: string,
    p1Snapshot: FightPlayerSnapshot,
    p2Snapshot: FightPlayerSnapshot,
  ): Promise<Result<RpgFightData | null, Error>> {
    try {
      const col = await this.collection();
      const now = new Date();
      
      // Atomic CAS: only accept if still pending
      const result = await col.findOneAndUpdate(
        { _id: fightId, status: "pending" },
        {
          $set: {
            status: "active",
            p1Snapshot,
            p2Snapshot,
            p1Hp: p1Snapshot.maxHp,
            p2Hp: p2Snapshot.maxHp,
            acceptedAt: now.toISOString(),
          },
        },
        { returnDocument: "after" }
      );
      
      if (!result) {
        return OkResult(null); // Fight not found or not pending
      }
      
      return OkResult(result);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async submitMove(
    fightId: string,
    playerId: string,
    move: CombatMove,
  ): Promise<Result<RpgFightData | null, Error>> {
    try {
      const col = await this.collection();
      
      // Determine which field to update
      const updateField = playerId === "p1" ? "p1PendingMove" : "p2PendingMove";
      
      const result = await col.findOneAndUpdate(
        { _id: fightId, status: "active" },
        { $set: { [updateField]: move } },
        { returnDocument: "after" }
      );
      
      if (!result) {
        return OkResult(null);
      }
      
      return OkResult(result);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async resolveRound(
    fightId: string,
    round: FightRound,
    newP1Hp: number,
    newP2Hp: number,
  ): Promise<Result<RpgFightData | null, Error>> {
    try {
      const col = await this.collection();
      
      const result = await col.findOneAndUpdate(
        { _id: fightId, status: "active" },
        {
          $push: { rounds: round },
          $set: {
            p1Hp: newP1Hp,
            p2Hp: newP2Hp,
            p1PendingMove: null,
            p2PendingMove: null,
            currentRound: round.roundNumber + 1,
          },
        },
        { returnDocument: "after" }
      );
      
      if (!result) {
        return OkResult(null);
      }
      
      return OkResult(result);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async complete(
    fightId: string,
    winnerId: string,
  ): Promise<Result<RpgFightData | null, Error>> {
    try {
      const col = await this.collection();
      const now = new Date();
      
      const result = await col.findOneAndUpdate(
        { _id: fightId, status: "active" },
        {
          $set: {
            status: "completed",
            winnerId,
            finishedAt: now.toISOString(),
          },
        },
        { returnDocument: "after" }
      );
      
      if (!result) {
        return OkResult(null);
      }
      
      return OkResult(result);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async expire(fightId: string): Promise<Result<RpgFightData | null, Error>> {
    try {
      const col = await this.collection();
      const now = new Date();
      
      const result = await col.findOneAndUpdate(
        { _id: fightId, status: { $in: ["pending", "active"] } },
        {
          $set: {
            status: "expired",
            finishedAt: now.toISOString(),
          },
        },
        { returnDocument: "after" }
      );
      
      if (!result) {
        return OkResult(null);
      }
      
      return OkResult(result);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async forfeit(fightId: string, forfeiterId: string): Promise<Result<RpgFightData | null, Error>> {
    try {
      const col = await this.collection();
      const now = new Date();
      
      // Winner is the other player
      const fight = await col.findOne({ _id: fightId });
      if (!fight) return OkResult(null);
      
      const winnerId = forfeiterId === fight.p1Id ? fight.p2Id : fight.p1Id;
      
      const result = await col.findOneAndUpdate(
        { _id: fightId, status: "active" },
        {
          $set: {
            status: "forfeited",
            winnerId,
            finishedAt: now.toISOString(),
          },
        },
        { returnDocument: "after" }
      );
      
      if (!result) {
        return OkResult(null);
      }
      
      return OkResult(result);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async list(
    query: FightQuery,
    page: number,
    pageSize: number,
  ): Promise<Result<RpgFightData[], Error>> {
    try {
      const col = await this.collection();
      
      const filter: Record<string, unknown> = {};
      if (query.status) filter.status = query.status;
      if (query.p1Id) filter.p1Id = query.p1Id;
      if (query.p2Id) filter.p2Id = query.p2Id;
      if (query.userId) {
        filter.$or = [{ p1Id: query.userId }, { p2Id: query.userId }];
      }
      
      const docs = await col
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(page * pageSize)
        .limit(pageSize)
        .toArray();
      
      return OkResult(docs);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async deleteById(fightId: string): Promise<Result<boolean, Error>> {
    try {
      const col = await this.collection();
      const result = await col.deleteOne({ _id: fightId });
      return OkResult(result.deletedCount === 1);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/** Singleton instance. */
export const rpgFightRepo: RpgFightRepo = new RpgFightRepoImpl();
