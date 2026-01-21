import type { Result } from "../../../src/utils/result";

export class AssertionError extends Error {
  expected?: unknown;
  actual?: unknown;

  constructor(message: string, expected?: unknown, actual?: unknown) {
    super(message);
    this.name = "AssertionError";
    this.expected = expected;
    this.actual = actual;
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object") return false;
  return Object.prototype.toString.call(value) === "[object Object]";
};

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (isPlainObject(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys(value[key]);
    }
    return sorted;
  }
  return value;
};

export const stableStringify = (value: unknown): string =>
  JSON.stringify(sortKeys(value));

export const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new AssertionError(message);
  }
};

export const assertEqual = <T>(
  actual: T,
  expected: T,
  message: string,
): void => {
  if (actual !== expected) {
    throw new AssertionError(message, expected, actual);
  }
};

export const assertDeepEqual = (
  actual: unknown,
  expected: unknown,
  message: string,
): void => {
  const a = stableStringify(actual);
  const b = stableStringify(expected);
  if (a !== b) {
    throw new AssertionError(message, expected, actual);
  }
};

export const assertIncludes = (
  haystack: string,
  needle: string,
  message: string,
): void => {
  if (!haystack.includes(needle)) {
    throw new AssertionError(message, needle, haystack);
  }
};

export const assertOk = <T>(result: Result<T>): T => {
  if (result.isErr()) {
    const error = result.error;
    const message = error instanceof Error ? error.message : String(error);
    throw new AssertionError(`Expected Ok result, got Err: ${message}`);
  }
  return result.unwrap();
};

export const assertErr = <T>(result: Result<T>): Error => {
  if (result.isOk()) {
    throw new AssertionError("Expected Err result, got Ok");
  }
  return result.error as Error;
};
