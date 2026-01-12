import { getDb } from "@/db/mongo";
import type { Filter } from "mongodb";
import { type User } from "@/db/schemas/user";
import { unwrapFindOneAndUpdateResult } from "@/db/helpers";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { UserStore } from "./users";

const usersCollection = async () => (await getDb()).collection<User>("users");

const sanitizeTickets = (list: string[]) =>
    Array.from(new Set(list.filter((s) => typeof s === "string")));

/**
 * Specialized repository for tracking open tickets per user.
 */
export const UserTicketsRepo = {
    async listOpen(userId: string): Promise<Result<string[]>> {
        const res = await UserStore.ensure(userId);
        if (res.isErr()) return res.map(() => []);
        return OkResult(res.unwrap().openTickets ?? []);
    },

    async setOpen(userId: string, tickets: string[]): Promise<Result<string[]>> {
        try {
            const res = await UserStore.patch(userId, {
                openTickets: sanitizeTickets(tickets)
            } as any);
            return res.map(u => u.openTickets ?? []);
        } catch (error) {
            return ErrResult(error instanceof Error ? error : new Error(String(error)));
        }
    },

    async addOpen(userId: string, channelId: string): Promise<Result<string[]>> {
        try {
            const col = await usersCollection();
            const res = await col.findOneAndUpdate(
                { _id: userId },
                {
                    $addToSet: { openTickets: channelId },
                    $set: { updatedAt: new Date() }
                } as any,
                { returnDocument: "after" }
            );
            const doc = unwrapFindOneAndUpdateResult<User>(res);
            return OkResult(doc?.openTickets ?? []);
        } catch (error) {
            return ErrResult(error instanceof Error ? error : new Error(String(error)));
        }
    },

    async removeOpen(userId: string, channelId: string): Promise<Result<string[]>> {
        try {
            const col = await usersCollection();
            const res = await col.findOneAndUpdate(
                { _id: userId },
                {
                    $pull: { openTickets: channelId },
                    $set: { updatedAt: new Date() }
                } as any,
                { returnDocument: "after" }
            );
            const doc = unwrapFindOneAndUpdateResult<User>(res);
            return OkResult(doc?.openTickets ?? []);
        } catch (error) {
            return ErrResult(error instanceof Error ? error : new Error(String(error)));
        }
    },

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
                            $lt: [{ $size: { $ifNull: ["$openTickets", []] } }, Math.trunc(maxPerUser)],
                        },
                    },
                ],
            } as any;

            const res = await col.findOneAndUpdate(
                filter,
                {
                    $addToSet: { openTickets: channelId },
                    $set: { updatedAt: now }
                } as any,
                { returnDocument: "after" }
            );

            return OkResult(Boolean(unwrapFindOneAndUpdateResult<User>(res)));
        } catch (error) {
            return ErrResult(error instanceof Error ? error : new Error(String(error)));
        }
    },

    async removeByChannel(channelId: string): Promise<Result<void>> {
        try {
            if (!channelId) return OkResult(undefined);
            const col = await usersCollection();
            await col.updateMany(
                { openTickets: channelId } as any,
                { $pull: { openTickets: channelId } } as any
            );
            return OkResult(undefined);
        } catch (error) {
            return ErrResult(error instanceof Error ? error : new Error(String(error)));
        }
    }
};
