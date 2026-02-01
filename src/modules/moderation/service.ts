import { getDb } from "@/db/mongo";
import { type SanctionType } from "@/db/schemas/user";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { UserStore } from "@/db/repositories/users";

/**
 * Register a sanction case in the user's history for a specific guild.
 */
export async function registerCase(
  userId: string,
  guildId: string,
  type: SanctionType,
  description: string,
): Promise<Result<void>> {
  try {
    // Ensure user exists first
    await UserStore.ensure(userId);

    const db = await getDb();
    const col = db.collection("users");
    const fieldPath = `sanction_history.${guildId}`;

    await col.updateOne(
      { _id: userId } as any,
      {
        $push: {
          [fieldPath]: {
            type,
            description,
            date: new Date().toISOString(),
          },
        },
        $set: { updatedAt: new Date() },
      } as any,
    );

    return OkResult(undefined);
  } catch (error) {
    console.error("[ModerationService] Failed to register case", {
      userId,
      guildId,
      error,
    });
    return ErrResult(error instanceof Error ? error : new Error(String(error)));
  }
}

export const ModerationService = {
  registerCase,
};
