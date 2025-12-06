
import { Model, FilterQuery } from "mongoose";
import { connectMongo } from "./client";

/**
 * Generic Mongo Store to simplify repetitive simplified CRUD operations.
 * 
 * T: The interface of the raw data (plain object).
 * D: The interface of the Mongoose Document (usually T & Document).
 */
export class MongoStore<T> {
    constructor(
        protected model: Model<T>,
        protected defaultGenerator: (id: string) => T
    ) { }

    protected async connect() {
        await connectMongo();
    }

    /**
     * Fetch a document by ID. Returns null if not found.
     */
    async get(id: string): Promise<T | null> {
        await this.connect();
        // @ts-ignore - lean() typing is sometimes tricky with generics
        const doc = await this.model.findById(id).lean();
        return (doc as T) || null;
    }

    /**
     * Fetch a document by ID, treating it as 'guaranteed' to exist.
     * If it doesn't exist, it returns the default value (but doesn't persist it yet unless upsert is called).
     * 
     * Actually, ensure usually implies "create if not exists".
     */
    async ensure(id: string): Promise<T> {
        await this.connect();
        let doc = await this.model.findById(id).lean();
        if (doc) return doc as T;

        // If not found, create it
        const def = this.defaultGenerator(id);
        const created = await this.model.create(def);
        return (created.toObject ? created.toObject() : created) as T;
    }

    /**
     * Check if a document exists by ID.
     */
    async exists(id: string): Promise<boolean> {
        await this.connect();
        const result = await this.model.exists({ _id: id } as FilterQuery<T>);
        return !!result;
    }

    /**
     * Update a document by ID.
     * Uses $set to merge fields.
     */
    async update(id: string, partial: Partial<T>): Promise<T | null> {
        await this.connect();
        // @ts-ignore
        const doc = await this.model.findByIdAndUpdate(
            id,
            { $set: partial },
            { new: true, lean: true }
        );
        return (doc as T) || null;
    }

    /**
     * Upsert a document (Create or Update).
     */
    async set(id: string, partial: Partial<T>): Promise<T> {
        await this.connect();

        // First ensure it exists (or just use upsert with setOnInsert)
        // We want to merge with defaults if creating.

        // Efficient upsert pattern:
        // If we use findOneAndUpdate with upsert: true, we need $setOnInsert for the rest of defaults.

        const defaults = this.defaultGenerator(id);
        // @ts-ignore
        const doc = await this.model.findByIdAndUpdate(
            id,
            {
                $set: partial,
                $setOnInsert: defaults
            } as any,
            { new: true, upsert: true, lean: true }
        );
        return doc as T;
    }

    /**
     * Remove a document by ID.
     */
    async remove(id: string): Promise<boolean> {
        await this.connect();
        const res = await this.model.deleteOne({ _id: id } as FilterQuery<T>);
        return (res.deletedCount ?? 0) > 0;
    }
}
