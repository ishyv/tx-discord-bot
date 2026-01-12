import type { Collection, Document, Filter, UpdateFilter, FindOptions } from "mongodb";
import { getDb } from "./mongo";
import { buildSafeUpsertUpdate, unwrapFindOneAndUpdateResult } from "./helpers";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { ZodSchema } from "zod";

/**
 * Generic Mongo store for entities with Zod validation.
 */
export class MongoStore<T extends Document & { _id: string }> {
    constructor(
        private readonly collectionName: string,
        private readonly schema: ZodSchema<T>
    ) { }

    /**
     * Get the MongoDB collection instance.
     */
    public async collection(): Promise<Collection<T>> {
        return (await getDb()).collection<T>(this.collectionName);
    }

    private mapError(error: unknown): Error {
        return error instanceof Error ? error : new Error(String(error));
    }

    private getDefault(id: string): T {
        const raw = { _id: id };
        const parsed = this.schema.safeParse(raw);
        if (parsed.success) return parsed.data;

        console.error(`[MongoStore:${this.collectionName}] failed to build default; using raw fallback`, {
            id,
            error: parsed.error,
        });
        return raw as unknown as T;
    }

    private parse(doc: unknown): T {
        const parsed = this.schema.safeParse(doc);
        if (parsed.success) return parsed.data;

        const id = (doc as any)?._id ?? "unknown";
        console.error(`[MongoStore:${this.collectionName}] invalid document; using defaults`, { id, error: parsed.error });
        return this.getDefault(id);
    }

    /**
     * Fetch an entity by ID.
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
     * Ensure an entity exists, creating it with defaults if missing.
     */
    async ensure(id: string, initial?: Partial<T>): Promise<Result<T>> {
        try {
            const col = await this.collection();
            const defaults = { ...this.getDefault(id), ...initial };

            const update = buildSafeUpsertUpdate<T>(
                { $setOnInsert: defaults as any },
                defaults as any,
                new Date(),
                { setUpdatedAt: false }
            );

            const res = await col.findOneAndUpdate(
                { _id: id } as Filter<T>,
                update as UpdateFilter<T>,
                { upsert: true, returnDocument: "after" }
            );

            const doc = unwrapFindOneAndUpdateResult<T>(res as any);
            return OkResult(this.parse(doc));
        } catch (error) {
            return ErrResult(this.mapError(error));
        }
    }

    /**
     * Perform a partial update (patch) on an entity.
     */
    async patch(id: string, patch: Partial<T>): Promise<Result<T>> {
        try {
            const col = await this.collection();
            const defaults = this.getDefault(id);

            const update = buildSafeUpsertUpdate<T>(
                { $set: patch as any },
                defaults,
                new Date()
            );

            const res = await col.findOneAndUpdate(
                { _id: id } as Filter<T>,
                update as UpdateFilter<T>,
                { upsert: true, returnDocument: "after" }
            );

            const doc = unwrapFindOneAndUpdateResult<T>(res as any);
            return OkResult(this.parse(doc));
        } catch (error) {
            return ErrResult(this.mapError(error));
        }
    }

    /**
     * Set/Upsert a full document.
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
     * Atomic Compare-And-Swap (CAS) update.
     */
    async replaceIfMatch(
        id: string,
        expected: Partial<T>,
        next: Partial<T>
    ): Promise<Result<T | null>> {
        try {
            const col = await this.collection();
            const now = new Date();

            const res = await col.findOneAndUpdate(
                { _id: id, ...expected } as Filter<T>,
                { $set: { ...next, updatedAt: now } as any },
                { returnDocument: "after" }
            );

            const doc = unwrapFindOneAndUpdateResult<T>(res as any);
            return OkResult(doc ? this.parse(doc) : null);
        } catch (error) {
            return ErrResult(this.mapError(error));
        }
    }

    /**
     * Delete an entity.
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
     * Atomic update by paths (dot-notation).
     */
    async updatePaths(
        id: string,
        paths: Record<string, unknown>,
        options: { upsert?: boolean; pipeline?: Document[] } = {}
    ): Promise<Result<void>> {
        try {
            const col = await this.collection();
            const now = new Date();

            if (options.pipeline) {
                await col.updateOne({ _id: id } as Filter<T>, options.pipeline as any, { upsert: options.upsert });
            } else {
                await col.updateOne(
                    { _id: id } as Filter<T>,
                    { $set: { ...paths, updatedAt: now } as any },
                    { upsert: options.upsert }
                );
            }

            return OkResult(undefined);
        } catch (error) {
            return ErrResult(this.mapError(error));
        }
    }

    /**
     * Find multiple entities by filter.
     */
    async find(filter: Filter<T>, options?: FindOptions<T>): Promise<Result<T[]>> {
        try {
            const col = await this.collection();
            const docs = await col.find(filter, options).toArray();
            return OkResult(docs.map(doc => this.parse(doc as any)));
        } catch (error) {
            return ErrResult(this.mapError(error));
        }
    }
}
