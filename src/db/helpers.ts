/**
 * Motivation: Share data layer specific utilities without replicating them in every repository.
 *
 * Concept: Pure functions that help manipulate documents, defaults, or clones in database operations.
 *
 * Scope: Complementary support; does not open connections or perform queries on its own.
 */
import type { UpdateFilter } from "mongodb";

/**
 * Create a deep copy of the provided value so callers can mutate it safely.
 */
export function deepClone<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  return structuredClone(value);
}

const UPDATE_OPERATORS = new Set([
  "$set",
  "$unset",
  "$inc",
  "$mul",
  "$push",
  "$addToSet",
  "$pull",
  "$pullAll",
  "$pop",
  "$min",
  "$max",
  "$currentDate",
  "$bit",
  "$rename",
  "$setOnInsert",
]);

const UPDATE_OPERATORS_EXCLUDED_FROM_TOUCH = new Set(["$setOnInsert"]);

const isOperatorUpdate = (update: Record<string, unknown>): boolean =>
  Object.keys(update).some((key) => key.startsWith("$"));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/**
 * Collect the paths touched by update operators (excludes $setOnInsert).
 */
export function collectTouchedPaths(
  update: UpdateFilter<unknown>,
): Set<string> {
  const touched = new Set<string>();
  if (!update || typeof update !== "object") return touched;

  const updateDoc = update as Record<string, unknown>;
  if (!isOperatorUpdate(updateDoc)) {
    for (const key of Object.keys(updateDoc)) {
      if (key) touched.add(key);
    }
    return touched;
  }

  for (const [operator, payload] of Object.entries(updateDoc)) {
    if (!operator.startsWith("$")) continue;
    if (!UPDATE_OPERATORS.has(operator)) continue;
    if (UPDATE_OPERATORS_EXCLUDED_FROM_TOUCH.has(operator)) continue;
    if (!isRecord(payload)) continue;

    if (operator === "$rename") {
      for (const [from, to] of Object.entries(payload)) {
        if (from) touched.add(from);
        if (typeof to === "string" && to) touched.add(to);
      }
      continue;
    }

    for (const key of Object.keys(payload)) {
      if (key) touched.add(key);
    }
  }

  return touched;
}

/**
 * Remove any conflicting paths from $setOnInsert.
 */
export function pruneConflictsFromSetOnInsert(
  setOnInsert: Record<string, unknown> | undefined,
  touchedPaths: Iterable<string>,
): Record<string, unknown> | undefined {
  if (!setOnInsert) return setOnInsert;

  const pruned: Record<string, unknown> = {};
  const touched = Array.from(touchedPaths ?? []);

  outer: for (const [key, value] of Object.entries(setOnInsert)) {
    if (key === "updatedAt") continue;

    for (const path of touched) {
      if (!path) continue;
      if (key === path) continue outer;
      if (key.startsWith(`${path}.`)) continue outer;
      if (path.startsWith(`${key}.`)) continue outer;
    }

    pruned[key] = value;
  }

  return pruned;
}

/**
 * Build a safe upsert update that avoids conflicting update operators.
 */
export function buildSafeUpsertUpdate<TSchema>(
  update: UpdateFilter<TSchema>,
  defaults: Record<string, unknown>,
  now: Date = new Date(),
  options: { setUpdatedAt?: boolean } = {},
): UpdateFilter<TSchema> {
  if (!update || typeof update !== "object") return update;

  const updateDoc = update as Record<string, unknown>;
  if (!isOperatorUpdate(updateDoc)) return update;

  const existingSet =
    (updateDoc.$set as Record<string, unknown> | undefined) ?? {};
  const existingSetOnInsert =
    (updateDoc.$setOnInsert as Record<string, unknown> | undefined) ?? {};

  const touched = collectTouchedPaths(update);
  const mergedSetOnInsert = {
    ...(defaults ?? {}),
    ...(existingSetOnInsert ?? {}),
  };
  const prunedSetOnInsert = pruneConflictsFromSetOnInsert(
    mergedSetOnInsert,
    touched,
  );

  const nextSet = { ...existingSet };
  const shouldSetUpdatedAt = options.setUpdatedAt !== false;
  const hasCurrentDate =
    isRecord(updateDoc.$currentDate) &&
    Object.prototype.hasOwnProperty.call(updateDoc.$currentDate, "updatedAt");

  if (shouldSetUpdatedAt && !hasCurrentDate) {
    nextSet.updatedAt = now;
  }

  const nextUpdate: UpdateFilter<TSchema> = {
    ...update,
  };

  if (Object.keys(nextSet).length > 0) {
    (nextUpdate as any).$set = nextSet;
  } else if ((nextUpdate as any).$set) {
    delete (nextUpdate as any).$set;
  }

  if (prunedSetOnInsert && Object.keys(prunedSetOnInsert).length > 0) {
    (nextUpdate as any).$setOnInsert = prunedSetOnInsert;
  } else if ((nextUpdate as any).$setOnInsert) {
    delete (nextUpdate as any).$setOnInsert;
  }

  return nextUpdate;
}

/**
 * Normalize findOneAndUpdate results for both legacy and metadata modes.
 */
export function unwrapFindOneAndUpdateResult<T>(
  result: T | { value?: T | null } | null | undefined,
): T | null {
  if (!result) return null;
  if (typeof result === "object" && "value" in result) {
    return (result as { value?: T | null }).value ?? null;
  }
  return result as T;
}
