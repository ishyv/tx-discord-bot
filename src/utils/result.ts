/**
 * Typed result for operations that can fail.
 *
 * System context:
 * - This type is used in repositories/services/handlers to model errors without using `throw`.
 * - Allows distinguishing between "no data" (`Ok(null)`) and "operation failed" (`Err(error)`).
 *
 * Invariants and contract:
 * - **Runtime no-throw**: in runtime paths (handlers/commands/services) the repo aims not
 *   to bring down the process due to a point failure.
 * - `Err.unwrap()` **does not throw** (see docstring in the method). Logs and returns `undefined`.
 * - Callers must **check** `isErr()`/`isOk()` before using `unwrap()`, unless
 *   `undefined` is an acceptable value.
 *
 * Gotchas:
 * - If you call `unwrap()` on `Err` and then access properties (`unwrap().foo`), you will get
 *   a `TypeError`. This is deliberate: the contract requires guards.
 *
 * Example (recommended pattern):
 * ```ts
 * const res = await repoCall();
 * if (res.isErr()) return ErrResult(res.error);
 * const value = res.unwrap();
 * // ... use value
 * ```
 */
export type Result<T, E = Error> = Ok<T, E> | Err<T, E>;

export class Ok<T, E> {
  readonly ok = true;
  readonly err = false;

  constructor(public readonly value: T) { }

  isOk(): this is Ok<T, E> {
    return true;
  }

  isErr(): this is Err<T, E> {
    return false;
  }

  /**
   * Returns the contained value.
   *
   * @remarks
   * In `Ok`, `unwrap()` is total (does not fail).
   */
  unwrap(): T {
    return this.value;
  }

  /**
   * Returns the contained value or the default value (ignored in Ok).
   */
  unwrapOr(_default: T): T {
    return this.value;
  }

  /**
   * Applies a function to the contained value and returns a new Result.
   */
  map<U>(fn: (value: T) => U): Result<U, E> {
    return new Ok(fn(this.value));
  }

  /**
   * Applies a function to the error (ignored in Ok).
   */
  mapErr<F>(_fn: (error: E) => F): Result<T, F> {
    return new Ok<T, F>(this.value);
  }

  /**
   * Executes a function with the contained value (side effect).
   */
  inspect(fn: (value: T) => void): Result<T, E> {
    fn(this.value);
    return this;
  }

  /**
   * Executes a function with the error (ignored in Ok).
   */
  inspectErr(_fn: (error: E) => void): Result<T, E> {
    return this;
  }
}

export class Err<T, E> {
  readonly ok = false;
  readonly err = true;

  constructor(public readonly error: E) { }

  isOk(): this is Ok<T, E> {
    return false;
  }

  isErr(): this is Err<T, E> {
    return true;
  }

  /**
   * Gets the value of the `Result`.
   *
   * @remarks
   * This project avoids `throw` in runtime paths (handlers, commands, services) so that
   * a point failure does not bring down the process.
   *
   * That's why, unlike Rust or other implementations, **`Err.unwrap()` DOES NOT throw**.
   * Instead:
   * - Logs a warning (so the error is visible in logs).
   * - Returns `undefined` as fallback.
   *
   * Important implication: `unwrap()` should only be used when the caller has already validated
   * `isOk()` / `isErr()` (or when `undefined` is an acceptable value).
   */
  unwrap(): T {
    console.warn(
      "Result.unwrap called on Err; returning undefined fallback.",
      this.error,
    );
    return undefined as unknown as T;
  }

  unwrapOr(defaultValue: T): T {
    return defaultValue;
  }

  map<U>(_fn: (value: T) => U): Result<U, E> {
    return new Err<U, E>(this.error);
  }

  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return new Err<T, F>(fn(this.error));
  }

  inspect(_fn: (value: T) => void): Result<T, E> {
    return this;
  }

  inspectErr(fn: (error: E) => void): Result<T, E> {
    fn(this.error);
    return this;
  }
}

/** Creates a successful result. */
export const OkResult = <T, E = Error>(value: T): Result<T, E> => new Ok(value);

/** Creates a failed result. */
export const ErrResult = <T, E = Error>(error: E): Result<T, E> =>
  new Err(error);
