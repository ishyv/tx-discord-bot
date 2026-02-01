/**
 * Purpose: Encapsulate CRUD and CAS operations on Mongo collections using
 * Zod validation on every read/write to prevent data corruption.
 * Context: Base repository layer (`UserStore`, `GuildStore`, etc.) that
 * applies timestamps and defaults, preventing features from duplicating 
 * upsert and normalization logic.
 * Key Dependencies: `buildSafeUpsertUpdate` (ensures `updatedAt` and 
 * timestamp paths), `unwrapFindOneAndUpdateResult` (handles driver variations),
 * and `ZodSchema` provided by each repository.
 * Invariants: All documents have `_id: string`; operations using 
 * `buildSafeUpsertUpdate` always write `updatedAt`; `parse` never throws 
 * and returns defaults if the document is invalid.
 * Gotchas: `updatePaths` with `pipeline` does not update `updatedAt` (the 
 * pipeline decides); `parse` may hide issues if validation failure logs 
 * are not monitored.
 */
import type {
  Collection,
  Document,
  Filter,
  FindOptions,
  UpdateFilter,
} from "mongodb";
import type { ZodSchema } from "zod";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { buildSafeUpsertUpdate, unwrapFindOneAndUpdateResult } from "./helpers";
import { getDb } from "./mongo";

/**
 * Generic Store with defensive validation.
 *
 * Invariants:
 * - The Zod schema is applied on every read and falls back to defaults if it fails.
 * - Upserts via `buildSafeUpsertUpdate` guarantee `updatedAt` unless the
 *   caller explicitly disables it.
 * - No-throw: returns `Result` so the caller can decide on retries.
 * RISK: Abusing defaults can hide broken documents; monitor `invalid document` logs.
 */
export class MongoStore<T extends Document & { _id: string }> {
  constructor(
    private readonly collectionName: string,
    private readonly schema: ZodSchema<T>,
  ) { }

  /**
   * Gets the Mongo collection.
   *
   * Purpose: Decouple the rest of the methods from the connection mechanism and
   * allow mocks in tests.
   * RISK: Does not cache the instance; depends on `getDb` managing the
   * client singleton.
   */
  public async collection(): Promise<Collection<T>> {
    return (await getDb()).collection<T>(this.collectionName);
  }

  private mapError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  private getDefault(id: string): T {
    const raw = { _id: id };

    // Check if schema expects guildId field and set it if needed
    try {
      const schemaDef = (this.schema as any)._def;
      if (schemaDef && schemaDef.typeName === "ZodObject" && schemaDef.shape) {
        const shape = schemaDef.shape();
        if (shape && shape.guildId) {
          (raw as any).guildId = id;
        }
      }
    } catch (error) {
      // If we can't determine the schema shape, continue without guildId
      // This maintains backward compatibility
    }

    const parsed = this.schema.safeParse(raw);
    if (parsed.success) return parsed.data;

    console.error(
      `[MongoStore:${this.collectionName}] failed to build default; using raw fallback`,
      {
        id,
        error: parsed.error,
      },
    );
    return raw as unknown as T;
  }

  private parse(doc: unknown): T {
    const parsed = this.schema.safeParse(doc);
    if (parsed.success) return parsed.data;

    const id = (doc as any)?._id ?? "unknown";
    console.error(
      `[MongoStore:${this.collectionName}] invalid document; using defaults`,
      { id, error: parsed.error },
    );
    return this.getDefault(id);
  }

  /**
   * Reads a document by `_id` and validates it.
   *
   * Returns `null` if it does not exist; never throws, encapsulates the error. 
   * Always passes through `parse` to normalize unexpected values and log 
   * failures if the schema fails.
   */
  async get(id: string): Promise<Result<T | null>> {
    try {
      const col = await this.collection();
      const doc = await col.findOne({ _id: id } as Filter<T>);
      return OkResult(doc ? this.parse(doc) : null);
    } catch (error) {
      return ErrResult(this.mapError(error));
    }
  }

  /**
   * Guarantees the existence of a document.
   *
   * Purpose: Initialize documents with defaults (derived from the schema)
   * when they don't exist yet. Uses `$setOnInsert` to avoid overwriting real data.
   * Invariants: Does not update `updatedAt` on insert because there is no prior
   * business change; `initial` is merged with defaults in the insert.
   * RISK: If the schema does not provide sufficient defaults, `getDefault`
   * may fill with empty values and hide shape errors.
   */
  async ensure(id: string, initial?: Partial<T>): Promise<Result<T>> {
    try {
      const col = await this.collection();
      const defaults = { ...this.getDefault(id), ...initial };

      const update = buildSafeUpsertUpdate<T>(
        { $setOnInsert: defaults as any },
        defaults as any,
        new Date(),
        { setUpdatedAt: false },
      );

      const res = await col.findOneAndUpdate(
        { _id: id } as Filter<T>,
        update as UpdateFilter<T>,
        { upsert: true, returnDocument: "after" },
      );

      const doc = unwrapFindOneAndUpdateResult<T>(res as any);
      return OkResult(this.parse(doc));
    } catch (error) {
      return ErrResult(this.mapError(error));
    }
  }

  /**
   * Performs a partial patch on a document.
   *
   * Purpose: Apply point changes without replacing the full document.
   * Side effects: Implicit upsert with `updatedAt` applied.
   * RISK: Defaults are merged if the document does not exist; can hide
   * previous schema discrepancies.
   */
  async patch(id: string, patch: Partial<T>): Promise<Result<T>> {
    try {
      const col = await this.collection();
      const defaults = this.getDefault(id);

      const update = buildSafeUpsertUpdate<T>(
        { $set: patch as any },
        defaults,
        new Date(),
      );

      const res = await col.findOneAndUpdate(
        { _id: id } as Filter<T>,
        update as UpdateFilter<T>,
        { upsert: true, returnDocument: "after" },
      );

      const doc = unwrapFindOneAndUpdateResult<T>(res as any);
      return OkResult(this.parse(doc));
    } catch (error) {
      return ErrResult(this.mapError(error));
    }
  }

  /**
   * Replaces or inserts the full document.
   *
   * Purpose: Cases where the final serializable object is already available. 
   * Does not touch `updatedAt`; the caller must have calculated it if relevant.
   * RISK: Overwrites the entire document; do not use for incremental patches.
   */
  async set(id: string, data: T): Promise<Result<T>> {
    try {
      const col = await this.collection();
      await col.replaceOne({ _id: id } as Filter<T>, data, { upsert: true });
      return OkResult(this.parse(data));
    } catch (error) {
      return ErrResult(this.mapError(error));
    }
  }

  /**
   * Actualiza condicionalmente si el documento coincide con `expected`.
   *
   * Propósito: soporte CAS para operaciones optimistas (ej. economía,
   * reputación). Incluye `updatedAt` al aplicar `next`.
   * Retorno: `null` si no coincidió el snapshot; útil para reintentos.
   * RISK: `expected` se mezcla en el filtro y debe ser mínimo pero estable; no
   * incluir campos que cambian frecuentemente (ej. timestamps variables).
   */
  async replaceIfMatch(
    id: string,
    expected: Partial<T>,
    next: Partial<T>,
  ): Promise<Result<T | null>> {
    try {
      const col = await this.collection();
      const now = new Date();

      const res = await col.findOneAndUpdate(
        { _id: id, ...expected } as Filter<T>,
        { $set: { ...next, updatedAt: now } as any },
        { returnDocument: "after" },
      );

      const doc = unwrapFindOneAndUpdateResult<T>(res as any);
      return OkResult(doc ? this.parse(doc) : null);
    } catch (error) {
      return ErrResult(this.mapError(error));
    }
  }

  /**
   * Deletes by `_id`.
   *
   * Purpose: Point removals. Does not clean up dependent relationships; the
   * caller must handle referential integrity invariants.
   */
  async delete(id: string): Promise<Result<boolean>> {
    try {
      const col = await this.collection();
      const res = await col.deleteOne({ _id: id } as Filter<T>);
      return OkResult((res.deletedCount ?? 0) > 0);
    } catch (error) {
      return ErrResult(this.mapError(error));
    }
  }

  /**
   * Updates specific fields by path (dot-notation) or pipeline.
   *
   * Purpose: Partial mutations without rebuilding the full document.
   * Side effects: When there is no `pipeline`, writes `updatedAt`; with `pipeline`
   * is delegated to the caller (timestamp is not auto-applied).
   * RISK: Combining `upsert` + `paths` partials can generate unexpected 
   * defaults; validate in critical callers.
   */
  async updatePaths(
    id: string,
    paths: Record<string, unknown>,
    options: { upsert?: boolean; pipeline?: Document[] } = {},
  ): Promise<Result<void>> {
    try {
      const col = await this.collection();
      const now = new Date();

      if (options.pipeline) {
        await col.updateOne({ _id: id } as Filter<T>, options.pipeline as any, {
          upsert: options.upsert,
        });
      } else {
        await col.updateOne(
          { _id: id } as Filter<T>,
          { $set: { ...paths, updatedAt: now } as any },
          { upsert: options.upsert },
        );
      }

      return OkResult(undefined);
    } catch (error) {
      return ErrResult(this.mapError(error));
    }
  }

  /**
   * Finds multiple documents and normalizes them with the schema.
   *
   * Purpose: Batch reads for listings or light migrations.
   * RISK: Lenient parsing can hide invalid documents; check logs if the
   * dataset is critical.
   */
  async find(
    filter: Filter<T>,
    options?: FindOptions<T>,
  ): Promise<Result<T[]>> {
    try {
      const col = await this.collection();
      const docs = await col.find(filter, options).toArray();
      return OkResult(docs.map((doc) => this.parse(doc as any)));
    } catch (error) {
      return ErrResult(this.mapError(error));
    }
  }
}
