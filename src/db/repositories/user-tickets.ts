import type { Filter } from "mongodb";
import { unwrapFindOneAndUpdateResult } from "@/db/helpers";
import { getDb } from "@/db/mongo";
import type { User } from "@/db/schemas/user";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { UserStore } from "./users";

/**
 * Specialized repository for `openTickets` per user.
 *
 * Purpose: Encapsulate reads/patches on the open tickets array with
 * sanitization and limits; prevents each feature from doing direct `$push`.
 * Invariants: `openTickets` is always an array of unique strings; all
 * operations return `Result` and do not throw.
 * Dependencies: `UserStore.ensure` to initialize documents; `getDb` for
 * the actual collection; `sanitizeTickets` removes duplicates and non-string entries.
 * Gotchas: `addWithLimit` depends on `$expr` and size; if the shape of
 * `openTickets` changes, adjust the filter; `ensure` can fill silent defaults.
 */

const usersCollection = async () => (await getDb()).collection<User>("users");

const sanitizeTickets = (list: string[]) =>
  Array.from(new Set(list.filter((s) => typeof s === "string")));

export const UserTicketsRepo = {
  /**
   * Returns normalized open tickets for a user.
   * Side effects: Guarantees the document via `UserStore.ensure`.
   * Errors: Returns an error `Result` if ensure fails; does not throw.
   */
  async listOpen(userId: string): Promise<Result<string[]>> {
    const res = await UserStore.ensure(userId);
    if (res.isErr()) return res.map(() => []);
    return OkResult(res.unwrap().openTickets ?? []);
  },

  /**
   * Replaces the `openTickets` array (sanitized) for a user.
   * Usage: Migrations or repairs; does not apply limit.
   */
  async setOpen(userId: string, tickets: string[]): Promise<Result<string[]>> {
    try {
      const res = await UserStore.patch(userId, {
        openTickets: sanitizeTickets(tickets),
      } as any);
      return res.map((u) => u.openTickets ?? []);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  },

  /**
   * Adds an open ticket without validating limit (uses $addToSet).
   * Used when the limit has already been checked in upper layers.
   */
  async addOpen(userId: string, channelId: string): Promise<Result<string[]>> {
    try {
      const col = await usersCollection();
      const res = await col.findOneAndUpdate(
        { _id: userId },
        {
          $addToSet: { openTickets: channelId },
          $set: { updatedAt: new Date() },
        } as any,
        { returnDocument: "after" },
      );
      const doc = unwrapFindOneAndUpdateResult<User>(res);
      return OkResult(doc?.openTickets ?? []);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  },

  /**
   * Removes a specific ticket from a user's array (with updatedAt).
   * Usage: Individual closures when the author is known.
   */
  async removeOpen(
    userId: string,
    channelId: string,
  ): Promise<Result<string[]>> {
    try {
      const col = await usersCollection();
      const res = await col.findOneAndUpdate(
        { _id: userId },
        {
          $pull: { openTickets: channelId },
          $set: { updatedAt: new Date() },
        } as any,
        { returnDocument: "after" },
      );
      const doc = unwrapFindOneAndUpdateResult<User>(res);
      return OkResult(doc?.openTickets ?? []);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  },

  /**
   * Adds a ticket only if it does not exceed `maxPerUser`.
   *
   * Strategy: Uses `$expr` to compare `openTickets` size and avoids simple
   * race conditions without transactions. Allows re-inserting the same channel
   * (idempotency) thanks to `$addToSet`.
   * RISK: Changes in the shape of `openTickets` or indexes may invalidate the
   * filter. Does not throw; returns `false` if the limit is exceeded.
   */
  async addWithLimit(
    userId: string,
    channelId: string,
    maxPerUser: number,
  ): Promise<Result<boolean>> {
    try {
      if (!channelId || maxPerUser <= 0) return OkResult(false);

      await UserStore.ensure(userId);

      const col = await usersCollection();
      const now = new Date();
      const filter: Filter<User> = {
        _id: userId,
        $or: [
          { openTickets: channelId },
          {
            $expr: {
              $lt: [
                { $size: { $ifNull: ["$openTickets", []] } },
                Math.trunc(maxPerUser),
              ],
            },
          },
        ],
      } as any;

      const res = await col.findOneAndUpdate(
        filter,
        {
          $addToSet: { openTickets: channelId },
          $set: { updatedAt: now },
        } as any,
        { returnDocument: "after" },
      );

      return OkResult(Boolean(unwrapFindOneAndUpdateResult<User>(res)));
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  },

  /**
   * Clears all references to a deleted ticket channel.
   * Usage: Forced closures or cleanup when the channel disappeared.
   */
  async removeByChannel(channelId: string): Promise<Result<void>> {
    try {
      if (!channelId) return OkResult(undefined);
      const col = await usersCollection();
      await col.updateMany(
        { openTickets: channelId } as any,
        { $pull: { openTickets: channelId } } as any,
      );
      return OkResult(undefined);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  },
};
