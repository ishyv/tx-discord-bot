/**
 * Economy Audit Log Types.
 *
 * Purpose: Define audit log structure for economy operations.
 * Encaje: Used by audit service to record all mutations.
 */

import type { CurrencyId } from "../currency";
import type { UserId } from "@/db/types";

/** Types of economy operations that can be audited. */
export type AuditOperationType =
  | "currency_adjust"
  | "currency_transfer"
  | "item_grant"
  | "item_remove"
  | "item_purchase"
  | "item_sell";

/** Audit log entry for economy operations. */
export interface EconomyAuditEntry {
  /** Unique ID for this audit entry (Mongo _id). */
  readonly _id: string;
  /** Type of operation performed. */
  readonly operationType: AuditOperationType;
  /** User who performed the action. */
  readonly actorId: UserId;
  /** User who was affected (may be same as actor for self-operations). */
  readonly targetId: UserId;
  /** Guild where action occurred (if applicable). */
  readonly guildId?: string;
  /** When the operation occurred. */
  readonly timestamp: Date;
  /** Source command or module that triggered this. */
  readonly source: string;
  /** Optional reason provided for the operation. */
  readonly reason?: string;
  /** Currency-specific data (if applicable). */
  readonly currencyData?: {
    currencyId: CurrencyId;
    delta: number;
    beforeBalance: unknown;
    afterBalance: unknown;
  };
  /** Item-specific data (if applicable). */
  readonly itemData?: {
    itemId: string;
    quantity: number;
    beforeQuantity?: number;
    afterQuantity?: number;
  };
  /** Additional metadata for extensibility. */
  readonly metadata?: Record<string, unknown>;
}

/** Input for creating an audit entry. */
export interface CreateAuditEntryInput {
  readonly operationType: AuditOperationType;
  readonly actorId: UserId;
  readonly targetId: UserId;
  readonly guildId?: string;
  readonly source: string;
  readonly reason?: string;
  readonly currencyData?: {
    currencyId: CurrencyId;
    delta: number;
    beforeBalance: unknown;
    afterBalance: unknown;
  };
  readonly itemData?: {
    itemId: string;
    quantity: number;
    beforeQuantity?: number;
    afterQuantity?: number;
  };
  readonly metadata?: Record<string, unknown>;
}

/** Query parameters for searching audit logs. */
export interface AuditQuery {
  /** Filter by actor. */
  actorId?: UserId;
  /** Filter by target. */
  targetId?: UserId;
  /** Filter by guild. */
  guildId?: string;
  /** Filter by operation type. */
  operationType?: AuditOperationType;
  /** Filter by currency (for currency operations). */
  currencyId?: CurrencyId;
  /** Start date (inclusive). */
  fromDate?: Date;
  /** End date (inclusive). */
  toDate?: Date;
  /** Pagination: page number (0-based). */
  page?: number;
  /** Pagination: page size. */
  pageSize?: number;
}

/** Paginated audit query result. */
export interface AuditQueryResult {
  readonly entries: EconomyAuditEntry[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}
