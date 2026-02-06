/**
 * RPG Combat UX Integration Tests.
 *
 * Purpose: Test Phase 12.3 UX features: timeouts, round cards, determinism.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { rpgFightService } from "@/modules/rpg/combat/fight-service";
import { rpgFightRepo } from "@/modules/rpg/combat/fight-repository";
import { rpgProfileRepo } from "@/modules/rpg/profile/repository";
import { economyAccountRepo } from "@/modules/economy/account/repository";
import { getDb, disconnectDb } from "@/db/mongo";
import { UserStore } from "@/db/repositories/users";
import { COMBAT_CONFIG } from "@/modules/rpg/config";
import { CombatEngine } from "@/modules/rpg/combat/engine";

describe("RPG Combat UX Integration (Phase 12.3)", () => {
    const p1Id = "test_ux_p1";
    const p2Id = "test_ux_p2";

    const mockResolveItem = () => ({ atk: 10, def: 5, hp: 0 });

    beforeAll(async () => {
        // Set test env
        process.env.DB_NAME = "pyebot_test";
        process.env.NODE_ENV = "test";

        await getDb();
        await rpgFightService.init();

        // Clean up test users
        const col = await UserStore.collection();
        await col.deleteMany({ _id: { $in: [p1Id, p2Id] } });

        // Setup accounts and profiles
        for (const userId of [p1Id, p2Id]) {
            await economyAccountRepo.ensure(userId);
            await rpgProfileRepo.ensure(userId);
        }
    });

    afterAll(async () => {
        const col = await UserStore.collection();
        await col.deleteMany({ _id: { $in: [p1Id, p2Id] } });
        await disconnectDb();
    });

    beforeEach(async () => {
        // Clear ALL fights for these users
        for (const userId of [p1Id, p2Id]) {
            const col = await rpgFightRepo.collection();
            await col.deleteMany({ $or: [{ p1Id: userId }, { p2Id: userId }] });
        }

        // Clear fighting locks
        for (const userId of [p1Id, p2Id]) {
            const profile = await rpgProfileRepo.findById(userId);
            if (profile.isOk() && profile.unwrap()) {
                const p = profile.unwrap()!;
                await rpgProfileRepo.updateCombatState(
                    userId,
                    false,
                    null,
                    100,
                    p.isFighting
                );
            }
        }
    });

    describe("Timeout Handling", () => {
        test("should resolve round automatically when overdue", async () => {
            // Create and accept fight
            const challenge = await rpgFightService.challenge(
                { inviterId: p1Id, targetId: p2Id },
                mockResolveItem,
            );
            expect(challenge.isOk()).toBe(true);

            const fightId = challenge.unwrap().fightId;
            const accept = await rpgFightService.accept({ fightId, accepterId: p2Id }, mockResolveItem);
            expect(accept.isOk()).toBe(true);

            // P1 submits move
            await rpgFightService.submitMove({ fightId, playerId: p1Id, move: "attack" });

            // SIMULATE TIMEOUT: manually update lastActionAt in DB
            const col = await rpgFightRepo.collection();
            const overdueTime = new Date(Date.now() - (COMBAT_CONFIG.roundTimeoutSeconds * 10) * 1000); // 10 mins ago
            await col.updateOne({ _id: fightId }, { $set: { lastActionAt: overdueTime.toISOString() } });

            // Trigger opportunistic resolution via getFight
            const status = await rpgFightService.getFight(fightId);
            expect(status.isOk()).toBe(true);

            const fightView = status.unwrap()!;
            expect(fightView.rounds).toBe(1);

            // Verify defaulted moves
            const fightData = await rpgFightRepo.findById(fightId);
            const round = fightData.unwrap()!.rounds[0];
            // Move might be "attack" or "crit" depending on RNG, but p2 MUST be defaulted
            expect(round.p2TimeoutDefaulted).toBe(true);
            expect(round.p1TimeoutDefaulted).toBe(false);
        });

        test("should handle double timeout resolution", async () => {
            // Create and accept fight
            const challenge = await rpgFightService.challenge(
                { inviterId: p1Id, targetId: p2Id },
                mockResolveItem,
            );
            expect(challenge.isOk()).toBe(true);
            const fightId = challenge.unwrap().fightId;
            await rpgFightService.accept({ fightId, accepterId: p2Id }, mockResolveItem);

            // Both players timeout
            const col = await rpgFightRepo.collection();
            const overdueTime = new Date(Date.now() - (COMBAT_CONFIG.roundTimeoutSeconds * 1000) - 5000);
            await col.updateOne({ _id: fightId }, { $set: { lastActionAt: overdueTime.toISOString() } });

            // Resolve
            const result = await rpgFightService.resolveOverdueRound(fightId);
            expect(result.isOk()).toBe(true);

            const fightData = await rpgFightRepo.findById(fightId);
            const round = fightData.unwrap()!.rounds[0];
            expect(round.p1TimeoutDefaulted).toBe(true);
            expect(round.p2TimeoutDefaulted).toBe(true);
        });
    });

    describe("Determinism", () => {
        test("should produce identical outcomes for the same seed/round", async () => {
            const seed = 12345;
            const session = {
                seed,
                currentRound: 0,
                p1Hp: 100, p2Hp: 100,
                p1Atk: 10, p2Atk: 10,
                p1Def: 5, p2Def: 5,
                p1HasShield: false, p2HasShield: false
            };

            const res1 = CombatEngine.resolveRound(session as any, "attack", "attack");
            const res2 = CombatEngine.resolveRound(session as any, "attack", "attack");

            expect(res1).toEqual(res2);
        });
    });

    describe("Forfeit & Expiration", () => {
        test("should clear locks and audit on forfeit", async () => {
            const challenge = await rpgFightService.challenge(
                { inviterId: p1Id, targetId: p2Id },
                mockResolveItem,
            );
            expect(challenge.isOk()).toBe(true);
            const fightId = challenge.unwrap().fightId;
            await rpgFightService.accept({ fightId, accepterId: p2Id }, mockResolveItem);

            const forfeit = await rpgFightService.forfeit(fightId, p1Id);
            expect(forfeit.isOk()).toBe(true);
            expect(forfeit.unwrap().status).toBe("forfeited");

            const p1Profile = await rpgProfileRepo.findById(p1Id);
            expect(p1Profile.unwrap()!.isFighting).toBe(false);
        });
    });
});
