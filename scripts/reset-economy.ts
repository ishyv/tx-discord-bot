import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME || "DEV";

if (!uri) {
    console.error("MONGO_URI is not defined in .env");
    process.exit(1);
}

// Default values as defined in src/modules/economy/guild/types.ts
const DEFAULT_FEATURE_FLAGS = {
    coinflip: true,
    trivia: true,
    rob: true,
    voting: true,
    crafting: true,
    store: true,
};

const DEFAULT_SECTOR_BALANCES = {
    global: 0,
    works: 0,
    trade: 0,
    tax: 0,
};

const DEFAULT_TAX_CONFIG = {
    rate: 0.05,
    enabled: true,
    minimumTaxableAmount: 0,
    taxSector: "tax",
};

const DEFAULT_TRANSFER_THRESHOLDS = {
    warning: 1000,
    alert: 10000,
    critical: 100000,
};

const DEFAULT_DAILY_CONFIG = {
    dailyReward: 50,
    dailyCooldownHours: 24,
    dailyCurrencyId: "coins",
    dailyFeeRate: 0.0,
    dailyFeeSector: "tax",
    dailyStreakBonus: 5,
    dailyStreakCap: 10,
};

const DEFAULT_WORK_CONFIG = {
    workRewardBase: 10,
    workBaseMintReward: 10,
    workBonusFromWorksMax: 20,
    workBonusScaleMode: "flat",
    workCooldownMinutes: 30,
    workDailyCap: 8,
    workCurrencyId: "coins",
    workPaysFromSector: "works",
    workFailureChance: 0.1,
};

const DEFAULT_PROGRESSION_CONFIG = {
    enabled: true,
    xpAmounts: {
        daily_claim: 60,
        work_claim: 25,
        store_buy: 15,
        store_sell: 10,
        quest_complete: 120,
        craft: 10,
    },
    cooldownSeconds: {
        daily_claim: 0,
        work_claim: 0,
        store_buy: 15,
        store_sell: 15,
        quest_complete: 0,
        craft: 0,
    },
};

const defaultEconomyData = {
    features: DEFAULT_FEATURE_FLAGS,
    sectors: DEFAULT_SECTOR_BALANCES,
    tax: DEFAULT_TAX_CONFIG,
    thresholds: DEFAULT_TRANSFER_THRESHOLDS,
    daily: DEFAULT_DAILY_CONFIG,
    work: DEFAULT_WORK_CONFIG,
    progression: DEFAULT_PROGRESSION_CONFIG,
    version: 0,
};

async function main() {
    const client = new MongoClient(uri!); // URI checked above
    try {
        await client.connect();
        console.log("Connected to MongoDB cluster");
        const db = client.db(dbName);
        const now = new Date();

        // 1. Reset Guild Economy Configurations to DEFAULTS
        console.log("[1/2] Resetting all guild economy configurations to DEFAULTS...");
        const guildUpdate = await db.collection("guilds").updateMany(
            {},
            {
                $set: {
                    economy: {
                        ...defaultEconomyData,
                        updatedAt: now,
                    },
                    updatedAt: now,
                },
            }
        );
        console.log(`Successfully reset configs for ${guildUpdate.matchedCount} guilds to the new standards.`);

        // 2. Clear User Economy Data (Accounts will be re-initialized with defaults on next match)
        console.log("[2/2] Clearing user economy data (soft purge for re-initialization)...");
        const userUpdate = await db.collection("users").updateMany(
            {},
            {
                $unset: {
                    economyAccount: "",
                    currency: "",
                    inventory: "",
                    progression: "",
                    equipment: "",
                    rpgProfile: "",
                    minigames: "",
                    votingStats: "",
                    voteAggregates: "",
                },
            }
        );
        console.log(`Cleared data for ${userUpdate.matchedCount} users.`);

        console.log("-----------------------------------------");
        console.log("SUCCESS: Economy reset and set to defaults.");
        console.log("-----------------------------------------");

    } catch (error) {
        console.error("CRITICAL ERROR during reset:", error);
    } finally {
        await client.close();
    }
}

main();
