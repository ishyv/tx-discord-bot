import mongoose from "mongoose";
import "dotenv/config";

/**
 * Single entrypoint for the Mongo connection.  Kept lazy so importing the
 * module will not throw when Mongo is not configured.  Call `connectMongo`
 * from whichever backend wiring chooses Mongo as the active datastore.
 */
let connectPromise: Promise<typeof mongoose> | null = null;

export interface MongoConnectionOptions {
  uri?: string;
  dbName?: string;
}

/**
 * Establish (or reuse) a Mongo connection. Repeated calls reuse the same
 * in-flight promise to avoid opening multiple pools.
 */
export async function connectMongo(
  opts: MongoConnectionOptions = {},
): Promise<typeof mongoose> {
  if (connectPromise) return connectPromise;

  const uri =
    opts.uri ?? process.env.MONGO_URI ?? process.env.DB_URI ?? undefined;
  if (!uri) {
    throw new Error(
      "MongoDB URI not configured. Set MONGO_URI (or DB_URI) before enabling the Mongo backend.",
    );
  }

  const dbName =
    opts.dbName ??
    process.env.MONGO_DB_NAME ??
    process.env.DB_NAME ??
    "pyebot";

  connectPromise = mongoose
    .connect(uri, {
      dbName,
      serverApi: {
        version: "1",
        strict: true,
        deprecationErrors: true,
      },
    })
    .then((conn) => {
      return conn;
    })
    .catch((err) => {
      connectPromise = null;
      throw err;
    });

  return connectPromise;
}

/** Optional helper to close the client during tests or graceful shutdowns. */
export async function disconnectMongo(): Promise<void> {
  if (!connectPromise) return;
  await mongoose.disconnect();
  connectPromise = null;
}
