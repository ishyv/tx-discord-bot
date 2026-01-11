import { getDb, disconnectDb } from "@/db/mongo";

const DEFAULT_DB_NAME = "pyebot_test";
const DISALLOWED_DB_NAMES = new Set(["pyebot", "prod", "production"]);

const readEnv = (key: string): string | undefined => {
  const raw = process.env[key];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : undefined;
};

export const getSeed = (): string =>
  readEnv("DB_TEST_SEED") ?? "db-tests";

let cachedNamespace: string | null = null;

export const getNamespace = (): string => {
  if (cachedNamespace) return cachedNamespace;
  cachedNamespace =
    readEnv("DB_TEST_NAMESPACE") ??
    `${getSeed()}-${Date.now().toString(36)}`;
  return cachedNamespace;
};

export const ensureTestEnv = (): void => {
  const uri =
    readEnv("MONGO_URI") ?? readEnv("MONGO_URI ") ?? readEnv("DB_URI");

  if (!uri) {
    throw new Error(
      "Missing MONGO_URI/DB_URI. Set a test DB connection string before running DB tests.",
    );
  }

  const dbName = readEnv("DB_NAME");
  if (!dbName) {
    process.env.DB_NAME = DEFAULT_DB_NAME;
  } else if (DISALLOWED_DB_NAMES.has(dbName)) {
    throw new Error(
      `Refusing to run DB tests against DB_NAME='${dbName}'. Use a test database name.`,
    );
  }

  process.env.NODE_ENV = "test";
};

export const connectDb = async (): Promise<void> => {
  await getDb();
};

export const shutdownDb = async (): Promise<void> => {
  await disconnectDb();
};
