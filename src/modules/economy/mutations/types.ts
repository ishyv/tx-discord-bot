/**
 * Currency Mutation Types.
 *
 * Purpose: Domain types for currency adjustment operations.
 * Encaje: Used by CurrencyMutationService and audit logging.
 */

import type { CurrencyId } from "../currency";
import type { UserId } from "@/db/types";

/** Input for adjusting a currency balance. */
export interface AdjustCurrencyBalanceInput {
  /** User ID performing the adjustment (moderator/admin). */
  readonly actorId: UserId;
  /** User ID receiving the adjustment. */
  readonly targetId: UserId;
  /** Guild ID where the adjustment occurred (if applicable). */
  readonly guildId?: string;
  /** Currency being adjusted. */
  readonly currencyId: CurrencyId;
  /** Amount to adjust (positive or negative). */
  readonly delta: number;
  /** Optional reason for the adjustment. */
  readonly reason?: string;
}

/** Result of a currency adjustment operation. */
export interface AdjustCurrencyBalanceResult {
  /** The target user's account after adjustment. */
  readonly targetId: UserId;
  /** Currency that was adjusted. */
  readonly currencyId: CurrencyId;
  /** Delta applied (may differ from input if currency has special handling). */
  readonly delta: number;
  /** Balance before adjustment. */
  readonly before: unknown;
  /** Balance after adjustment. */
  readonly after: unknown;
  /** Timestamp of the adjustment. */
  readonly timestamp: Date;
}

/** Input for transferring currency between users. */
export interface TransferCurrencyInput {
  /** User ID sending the currency. */
  readonly senderId: UserId;
  /** User ID receiving the currency. */
  readonly recipientId: UserId;
  /** Guild ID where the transfer occurred (if applicable). */
  readonly guildId?: string;
  /** Currency being transferred. */
  readonly currencyId: CurrencyId;
  /** Amount to transfer (must be positive). */
  readonly amount: number;
  /** Optional reason for the transfer. */
  readonly reason?: string;
  /** Optional correlation ID to link with other operations. */
  readonly correlationId?: string;
}

/** Result of a currency transfer operation. */
export interface TransferCurrencyResult {
  /** Unique correlation ID linking both sides of the transfer. */
  readonly transferId: string;
  /** Sender's user ID. */
  readonly senderId: UserId;
  /** Recipient's user ID. */
  readonly recipientId: UserId;
  /** Currency transferred. */
  readonly currencyId: CurrencyId;
  /** Amount transferred. */
  readonly amount: number;
  /** Sender's balance before transfer. */
  readonly senderBefore: unknown;
  /** Sender's balance after transfer. */
  readonly senderAfter: unknown;
  /** Recipient's balance before transfer. */
  readonly recipientBefore: unknown;
  /** Recipient's balance after transfer. */
  readonly recipientAfter: unknown;
  /** Timestamp of the transfer. */
  readonly timestamp: Date;
}

/** Error codes specific to currency mutations. */
export type CurrencyMutationErrorCode =
  | "CURRENCY_NOT_FOUND"
  | "TARGET_NOT_FOUND"
  | "TARGET_BLOCKED"
  | "TARGET_BANNED"
  | "ACTOR_BLOCKED"
  | "ACTOR_BANNED"
  | "INSUFFICIENT_PERMISSIONS"
  | "INVALID_DELTA"
  | "INVALID_AMOUNT"
  | "INSUFFICIENT_FUNDS"
  | "SELF_TRANSFER"
  | "UPDATE_FAILED";

/** Error class for currency mutation failures. */
export class CurrencyMutationError extends Error {
  constructor(
    public readonly code: CurrencyMutationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CurrencyMutationError";
  }
}
