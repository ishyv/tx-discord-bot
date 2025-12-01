import { Schema } from "mongoose";

export type CurrencyId = string;

export type CurrencyInventory = Record<CurrencyId, any>;

export const CurrencyInventorySchema = new Schema<Record<string, any>>(
  {},
  { strict: false, _id: false },
);


export interface Currency<TValue> {
  /** Unique id for registry and DB keys. */
  readonly id: CurrencyId;

  /** Default/empty value (e.g. starting at 0). */
  zero(): TValue;

  /** Nicely formatted for UI/logs. */
  display(value: TValue): string;

  /** a + b. Must be pure (do not mutate inputs). */
  add(a: TValue, b: TValue): TValue;

  /** a - b (does not throw, just math). Must be pure. */
  sub(a: TValue, b: TValue): TValue;

  /**
   * Check basic invariants like "no negative fields".
   * The transaction engine relies on this to accept/reject ops.
   */
  isValid(value: TValue): boolean;
}
