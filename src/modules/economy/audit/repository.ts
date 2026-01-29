/**
 * Economy Audit Repository.
 *
 * Purpose: Persist and query economy audit logs.
 * Encaje: MongoDB collection with standardized interface.
 * Dependencies: MongoStore for persistence.
 */

import { z } from "zod";
import { MongoStore } from "@/db/mongo-store";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type {
  EconomyAuditEntry,
  CreateAuditEntryInput,
  AuditQuery,
  AuditQueryResult,
} from "./types";

/** Zod schema for audit entry validation. */
const EconomyAuditEntrySchema = z.object({
  _id: z.string(),
  operationType: z.enum([
    "currency_adjust",
    "currency_transfer",
    "item_grant",
    "item_remove",
    "item_purchase",
    "item_sell",
  ]),
  actorId: z.string(),
  targetId: z.string(),
  guildId: z.string().optional(),
  timestamp: z.date().catch(() => new Date()),
  source: z.string(),
  reason: z.string().optional(),
  currencyData: z
    .object({
      currencyId: z.string(),
      delta: z.number(),
      beforeBalance: z.unknown(),
      afterBalance: z.unknown(),
    })
    .optional(),
  itemData: z
    .object({
      itemId: z.string(),
      quantity: z.number(),
      beforeQuantity: z.number().optional(),
      afterQuantity: z.number().optional(),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Audit store singleton. */
const AuditStore = new MongoStore<EconomyAuditEntry>(
  "economy_audit",
  EconomyAuditEntrySchema,
);

/**
 * Ensure indexes exist on the audit collection.
 * Should be called once at application startup.
 */
export async function ensureAuditIndexes(): Promise<void> {
  try {
    const col = await AuditStore.collection();

    // Index for querying by target (e.g., "show me my audit history")
    await col.createIndex({ targetId: 1, timestamp: -1 }, { name: "target_time_idx" });

    // Index for querying by actor (e.g., "show what this mod did")
    await col.createIndex({ actorId: 1, timestamp: -1 }, { name: "actor_time_idx" });

    // Index for guild-scoped queries
    await col.createIndex({ guildId: 1, timestamp: -1 }, { name: "guild_time_idx" });

    // Index for operation type queries (e.g., "show all transfers")
    await col.createIndex({ operationType: 1, timestamp: -1 }, { name: "optype_time_idx" });

    // TTL index: auto-delete entries older than 2 years (optional, adjust as needed)
    // Uncomment if you want automatic cleanup:
    // await col.createIndex(
    //   { timestamp: 1 },
    //   { expireAfterSeconds: 60 * 60 * 24 * 365 * 2, name: "ttl_2years_idx" }
    // );

    console.log("[EconomyAudit] Indexes ensured");
  } catch (error) {
    console.error("[EconomyAudit] Failed to ensure indexes:", error);
    // Don't throw - app can still function without indexes (just slower)
  }
}

/** Generate a simple ID for audit entries. */
function generateAuditId(): string {
  return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export interface EconomyAuditRepo {
  /**
   * Create a new audit entry.
   * Returns the created entry on success.
   */
  create(entry: CreateAuditEntryInput): Promise<Result<EconomyAuditEntry, Error>>;

  /**
   * Query audit logs with filters.
   */
  query(query: AuditQuery): Promise<Result<AuditQueryResult, Error>>;

  /**
   * Get a single audit entry by ID.
   */
  getById(id: string): Promise<Result<EconomyAuditEntry | null, Error>>;
}

class EconomyAuditRepoImpl implements EconomyAuditRepo {
  async create(
    entry: CreateAuditEntryInput,
  ): Promise<Result<EconomyAuditEntry, Error>> {
    const auditEntry: EconomyAuditEntry = {
      _id: generateAuditId(),
      operationType: entry.operationType,
      actorId: entry.actorId,
      targetId: entry.targetId,
      guildId: entry.guildId,
      timestamp: new Date(),
      source: entry.source,
      reason: entry.reason,
      currencyData: entry.currencyData,
      itemData: entry.itemData,
      metadata: entry.metadata,
    };

    try {
      const col = await AuditStore.collection();
      await col.insertOne(auditEntry as any, {});
      return OkResult(auditEntry);
    } catch (error) {
      console.error("[EconomyAuditRepo] Failed to create audit entry:", error);
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async query(query: AuditQuery): Promise<Result<AuditQueryResult, Error>> {
    try {
      const col = await AuditStore.collection();

      // Build filter
      const filter: Record<string, unknown> = {};
      if (query.actorId) filter.actorId = query.actorId;
      if (query.targetId) filter.targetId = query.targetId;
      if (query.guildId) filter.guildId = query.guildId;
      if (query.operationType) filter.operationType = query.operationType;
      if (query.currencyId) {
        filter["currencyData.currencyId"] = query.currencyId;
      }

      // Date range
      if (query.fromDate || query.toDate) {
        filter.timestamp = {};
        if (query.fromDate) (filter.timestamp as any).$gte = query.fromDate;
        if (query.toDate) (filter.timestamp as any).$lte = query.toDate;
      }

      // Pagination
      const page = Math.max(0, query.page ?? 0);
      const pageSize = Math.min(Math.max(1, query.pageSize ?? 20), 100);
      const skip = page * pageSize;

      // Execute query
      const [entries, total] = await Promise.all([
        col
          .find(filter as any)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(pageSize)
          .toArray(),
        col.countDocuments(filter as any),
      ]);

      return OkResult({
        entries: entries as EconomyAuditEntry[],
        total,
        page,
        pageSize,
        hasMore: skip + entries.length < total,
      });
    } catch (error) {
      console.error("[EconomyAuditRepo] Failed to query audit entries:", error);
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async getById(id: string): Promise<Result<EconomyAuditEntry | null, Error>> {
    try {
      const col = await AuditStore.collection();
      const entry = await col.findOne({ _id: id } as any);
      return OkResult(entry as EconomyAuditEntry | null);
    } catch (error) {
      console.error("[EconomyAuditRepo] Failed to get audit entry:", error);
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}

/** Singleton instance. */
export const economyAuditRepo: EconomyAuditRepo = new EconomyAuditRepoImpl();
