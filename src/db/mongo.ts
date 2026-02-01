/**
 * Mongo client singleton for the native driver.
 * Purpose: provide a single entrypoint to obtain the database handle (`getDb`) and close it (`disconnectDb`).
 * Why: replaces mongoose.connect usage with a minimal MongoClient setup.
 */
import { MongoClient, type Db } from "mongodb";

let client: MongoClient | null = null;
let dbInstance: Db | null = null;

let warnedLegacyUri = false;

const readEnv = (key: string): string | undefined => {
  const raw = process.env[key];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : undefined;
};

const getUri = (): string => {
  const uri = readEnv("MONGO_URI");

  if (!uri) {
    throw new Error(
      "MongoDB URI not configured. Set MONGO_URI (preferred) or DB_URI (legacy).",
    );
  }

  if (!warnedLegacyUri && !readEnv("MONGO_URI") && readEnv("DB_URI")) {
    warnedLegacyUri = true;
    console.warn(
      "[db] Using legacy DB_URI env var. Prefer MONGO_URI for consistency.",
    );
  }

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

export async function getMongoClient(): Promise<MongoClient> {
  if (!client) {
    client = new MongoClient(getUri());
  }
  await client.connect();
  return client;
}

export async function disconnectDb(): Promise<void> {
  if (client) {
    await client.close();
  }
  client = null;
  dbInstance = null;
}
