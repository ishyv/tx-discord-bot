/**
 * Mongo client singleton for the native driver.
 * Purpose: provide a single entrypoint to obtain the database handle (`getDb`) and close it (`disconnectDb`).
 * Why: replaces mongoose.connect usage with a minimal MongoClient setup.
 */
import { MongoClient, type Db } from "mongodb";

let client: MongoClient | null = null;
let dbInstance: Db | null = null;

const getUri = (): string => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MongoDB URI not configured (MONGO_URI).");
  return uri;
};

const getDbName = (): string => process.env.DB_NAME ?? "pyebot";

export async function getDb(): Promise<Db> {
  if (dbInstance) return dbInstance;
  if (!client) {
    client = new MongoClient(getUri());
  }
  await client.connect();
  dbInstance = client.db(getDbName());
  return dbInstance;
}

export async function disconnectDb(): Promise<void> {
  if (client) {
    await client.close();
  }
  client = null;
  dbInstance = null;
}
