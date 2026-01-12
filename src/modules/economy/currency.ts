export type CurrencyId = string;

export interface CurrencyValueMap {}

export type CurrencyValue<Id extends CurrencyId> =
  Id extends keyof CurrencyValueMap ? CurrencyValueMap[Id] : unknown;

// Currency inventory shape mirrors `User["currency"]` from the DB schema (Record<string, unknown>),
// but provides typed values for known currency IDs via module augmentation.
export type CurrencyInventory = Partial<CurrencyValueMap> & Record<CurrencyId, unknown>;

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
