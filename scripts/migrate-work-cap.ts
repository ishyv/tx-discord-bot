import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME || "test";

if (!uri) {
    console.error("MONGO_URI not found in .env");
    process.exit(1);
}

async function main() {
    const client = new MongoClient(uri!);
    try {
        await client.connect();
        console.log("Connected to MongoDB");
        const db = client.db(dbName);

        console.log("Updating workDailyCap to 8 for all guilds...");
        const result = await db.collection("guilds").updateMany(
            { "economy.work": { $exists: true } },
            {
                $set: {
                    "economy.work.workDailyCap": 8,
                    "updatedAt": new Date()
                }
            }
        );

        console.log(`Successfully updated ${result.modifiedCount} guilds.`);
    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        await client.close();
    }
}

main();
