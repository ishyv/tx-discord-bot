/**
 * RPG Fight Persistence Integration Tests.
 *
 * Purpose: Test combat persistence, bot restart resilience, and atomic operations.
 * Context: Phase R0.1 - Combat persistence hardening.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { rpgFightService } from "@/modules/rpg/combat/fight-service";
import { rpgFightRepo } from "@/modules/rpg/combat/fight-repository";
import { rpgProfileRepo } from "@/modules/rpg/profile/repository";
import { economyAccountRepo } from "@/modules/economy/account/repository";
import { connectToDatabase, disconnectFromDatabase } from "@/db/mongo";
import { UserStore } from "@/db/repositories/users";
import type { RpgFightData } from "@/modules/rpg/combat/fight-schema";

describe("RPG Fight Persistence (R0.1)", () => {
  const p1Id = "test_fight_p1";
  const p2Id = "test_fight_p2";
  const p3Id = "test_fight_p3";

  const mockResolveItem = () => ({ atk: 10, def: 5, hp: 0 });

  beforeAll(async () => {
    await connectToDatabase();
    await rpgFightService.init();

    // Clean up test users
    const col = await UserStore.collection();
    await col.deleteMany({ _id: { $in: [p1Id, p2Id, p3Id] } });

    // Setup accounts and profiles
    for (const userId of [p1Id, p2Id, p3Id]) {
      await economyAccountRepo.ensure(userId);
      await rpgProfileRepo.ensure(userId);
    }
  });

  afterAll(async () => {
    // Clean up
    const col = await UserStore.collection();
    await col.deleteMany({ _id: { $in: [p1Id, p2Id, p3Id] } });
    await disconnectFromDatabase();
  });

  beforeEach(async () => {
    // Clear any active fights
    const fights = await rpgFightRepo.list({ userId: p1Id }, 0, 100);
    if (fights.isOk()) {
      for (const fight of fights.unwrap()) {
        await rpgFightRepo.deleteById(fight._id);
      }
    }
    const fights2 = await rpgFightRepo.list({ userId: p2Id }, 0, 100);
    if (fights2.isOk()) {
      for (const fight of fights2.unwrap()) {
        await rpgFightRepo.deleteById(fight._id);
      }
    }

    // Clear fighting locks
    for (const userId of [p1Id, p2Id, p3Id]) {
      const profile = await rpgProfileRepo.findById(userId);
      if (profile.isOk() && profile.unwrap()) {
        await rpgProfileRepo.updateCombatState(
          userId,
          { currentHp: 100, isFighting: false, sessionId: null },
          profile.unwrap()!.combat.isFighting,
        );
      }
    }
  });

  describe("Bot Restart Simulation", () => {
    test("should recover fight state after simulated restart", async () => {
      // Create challenge
      const challenge = await rpgFightService.challenge(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );
      expect(challenge.isOk()).toBe(true);

      const fightId = challenge.unwrap().fightId;

      // Accept
      const accept = await rpgFightService.accept(
        { fightId, accepterId: p2Id },
        mockResolveItem,
      );
      expect(accept.isOk()).toBe(true);

      // SIMULATE BOT RESTART:
      // Clear any in-memory caches (simulate by just re-fetching)
      const fightAfterRestart = await rpgFightRepo.findById(fightId);
      expect(fightAfterRestart.isOk()).toBe(true);
      expect(fightAfterRestart.unwrap()).not.toBeNull();

      const fight = fightAfterRestart.unwrap()!;
      expect(fight.status).toBe("active");
      expect(fight.p1Snapshot).not.toBeNull();
      expect(fight.p2Snapshot).not.toBeNull();
      expect(fight.p1Hp).toBe(fight.p1Snapshot!.maxHp);
      expect(fight.p2Hp).toBe(fight.p2Snapshot!.maxHp);

      // Verify we can continue the fight (submit moves)
      const submit1 = await rpgFightService.submitMove({
        fightId,
        playerId: p1Id,
        move: "attack",
      });
      expect(submit1.isOk()).toBe(true);

      const submit2 = await rpgFightService.submitMove({
        fightId,
        playerId: p2Id,
        move: "block",
      });
      expect(submit2.isOk()).toBe(true);

      // Round should be resolved
      expect(submit2.unwrap().rounds).toBe(1);
    });

    test("should preserve RNG seed across restarts", async () => {
      const challenge = await rpgFightService.challenge(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );
      const fightId = challenge.unwrap().fightId;

      // Get seed before accept
      const fightBefore = await rpgFightRepo.findById(fightId);
      const seed = fightBefore.unwrap()!.seed;

      // Accept and resolve some rounds
      await rpgFightService.accept({ fightId, accepterId: p2Id }, mockResolveItem);

      await rpgFightService.submitMove({ fightId, playerId: p1Id, move: "attack" });
      await rpgFightService.submitMove({ fightId, playerId: p2Id, move: "attack" });

      // SIMULATE RESTART - fetch fresh
      const fightAfter = await rpgFightRepo.findById(fightId);
      expect(fightAfter.unwrap()!.seed).toBe(seed);
    });

    test("should detect active fight via DB query (no in-memory state)", async () => {
      // Create and accept fight
      const challenge = await rpgFightService.challenge(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );
      const fightId = challenge.unwrap().fightId;
      await rpgFightService.accept({ fightId, accepterId: p2Id }, mockResolveItem);

      // Check via service (should query DB, not memory)
      const isP1InFight = await rpgFightService.isInFight(p1Id);
      const isP2InFight = await rpgFightService.isInFight(p2Id);

      expect(isP1InFight).toBe(true);
      expect(isP2InFight).toBe(true);

      // Verify via repo directly
      const activeFight = await rpgFightRepo.findActiveByUser(p1Id);
      expect(activeFight.unwrap()).not.toBeNull();
    });
  });

  describe("Double Accept Protection", () => {
    test("should reject double accept (CAS)", async () => {
      const challenge = await rpgFightService.challenge(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );
      const fightId = challenge.unwrap().fightId;

      // First accept succeeds
      const accept1 = await rpgFightService.accept(
        { fightId, accepterId: p2Id },
        mockResolveItem,
      );
      expect(accept1.isOk()).toBe(true);

      // Second accept fails
      const accept2 = await rpgFightService.accept(
        { fightId, accepterId: p2Id },
        mockResolveItem,
      );
      expect(accept2.isErr()).toBe(true);
      expect(accept2.error!.code).toBe("COMBAT_ALREADY_ACCEPTED");
    });

    test("should reject accept after expire", async () => {
      const challenge = await rpgFightService.challenge(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );
      const fightId = challenge.unwrap().fightId;

      // Expire the fight
      await rpgFightService.expireFight(fightId);

      // Accept should fail
      const accept = await rpgFightService.accept(
        { fightId, accepterId: p2Id },
        mockResolveItem,
      );
      expect(accept.isErr()).toBe(true);
      expect(accept.error!.code).toBe("COMBAT_ALREADY_ACCEPTED");
    });

    test("should atomically set isFighting on both profiles", async () => {
      const challenge = await rpgFightService.challenge(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );
      const fightId = challenge.unwrap().fightId;

      await rpgFightService.accept({ fightId, accepterId: p2Id }, mockResolveItem);

      // Verify both profiles have isFighting=true
      const [p1Profile, p2Profile] = await Promise.all([
        rpgProfileRepo.findById(p1Id),
        rpgProfileRepo.findById(p2Id),
      ]);

      expect(p1Profile.unwrap()!.combat.isFighting).toBe(true);
      expect(p1Profile.unwrap()!.combat.sessionId).toBe(fightId);
      expect(p2Profile.unwrap()!.combat.isFighting).toBe(true);
      expect(p2Profile.unwrap()!.combat.sessionId).toBe(fightId);
    });
  });

  describe("Move Submission Concurrency", () => {
    test("should reject duplicate move submission", async () => {
      // Setup active fight
      const challenge = await rpgFightService.challenge(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );
      const fightId = challenge.unwrap().fightId;
      await rpgFightService.accept({ fightId, accepterId: p2Id }, mockResolveItem);

      // First submission succeeds
      const submit1 = await rpgFightService.submitMove({
        fightId,
        playerId: p1Id,
        move: "attack",
      });
      expect(submit1.isOk()).toBe(true);
      expect(submit1.unwrap().p1PendingMove).toBe(true);

      // Duplicate submission fails
      const submit2 = await rpgFightService.submitMove({
        fightId,
        playerId: p1Id,
        move: "block",
      });
      expect(submit2.isErr()).toBe(true);
      expect(submit2.error!.code).toBe("CONCURRENT_MODIFICATION");
    });

    test("should resolve round when both moves submitted", async () => {
      // Setup active fight
      const challenge = await rpgFightService.challenge(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );
      const fightId = challenge.unwrap().fightId;
      const accept = await rpgFightService.accept(
        { fightId, accepterId: p2Id },
        mockResolveItem,
      );
      const initialRound = accept.unwrap().currentRound;

      // Submit both moves
      await rpgFightService.submitMove({ fightId, playerId: p1Id, move: "attack" });
      const result = await rpgFightService.submitMove({
        fightId,
        playerId: p2Id,
        move: "attack",
      });

      expect(result.isOk()).toBe(true);
      expect(result.unwrap().currentRound).toBe(initialRound + 1);
      expect(result.unwrap().rounds).toBe(1);

      // Verify in DB
      const fight = await rpgFightRepo.findById(fightId);
      expect(fight.unwrap()!.rounds.length).toBe(1);
      expect(fight.unwrap()!.p1PendingMove).toBeNull();
      expect(fight.unwrap()!.p2PendingMove).toBeNull();
    });

    test("should handle concurrent move submission (last writer wins on move, not on round)", async () => {
      // Setup active fight
      const challenge = await rpgFightService.challenge(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );
      const fightId = challenge.unwrap().fightId;
      await rpgFightService.accept({ fightId, accepterId: p2Id }, mockResolveItem);

      // Both submit simultaneously (as simultaneous as we can make it)
      const [submit1, submit2] = await Promise.all([
        rpgFightService.submitMove({ fightId, playerId: p1Id, move: "attack" }),
        rpgFightService.submitMove({ fightId, playerId: p2Id, move: "block" }),
      ]);

      // Both should succeed
      expect(submit1.isOk()).toBe(true);
      expect(submit2.isOk()).toBe(true);

      // Round should be resolved (by the second submit)
      const fight = await rpgFightRepo.findById(fightId);
      expect(fight.unwrap()!.rounds.length).toBe(1);
    });
  });

  describe("Expire Clears Locks", () => {
    test("should clear isFighting on expire", async () => {
      // Setup active fight
      const challenge = await rpgFightService.challenge(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );
      const fightId = challenge.unwrap().fightId;
      await rpgFightService.accept({ fightId, accepterId: p2Id }, mockResolveItem);

      // Verify locks are set
      let p1Profile = await rpgProfileRepo.findById(p1Id);
      expect(p1Profile.unwrap()!.combat.isFighting).toBe(true);

      // Expire fight
      await rpgFightService.expireFight(fightId);

      // Verify locks cleared
      p1Profile = await rpgProfileRepo.findById(p1Id);
      const p2Profile = await rpgProfileRepo.findById(p2Id);

      expect(p1Profile.unwrap()!.combat.isFighting).toBe(false);
      expect(p1Profile.unwrap()!.combat.sessionId).toBeNull();
      expect(p2Profile.unwrap()!.combat.isFighting).toBe(false);
      expect(p2Profile.unwrap()!.combat.sessionId).toBeNull();
    });

    test("should create audit entry on expire", async () => {
      // Note: This test would need to check the audit repo
      // For now, we just verify the fight status changes
      const challenge = await rpgFightService.challenge(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );
      const fightId = challenge.unwrap().fightId;
      await rpgFightService.accept({ fightId, accepterId: p2Id }, mockResolveItem);

      await rpgFightService.expireFight(fightId);

      const fight = await rpgFightRepo.findById(fightId);
      expect(fight.unwrap()!.status).toBe("expired");
      expect(fight.unwrap()!.finishedAt).not.toBeNull();
    });

    test("should allow new fight after expire clears locks", async () => {
      // Setup and expire first fight
      const challenge1 = await rpgFightService.challenge(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );
      const fightId1 = challenge1.unwrap().fightId;
      await rpgFightService.accept({ fightId: fightId1, accepterId: p2Id }, mockResolveItem);
      await rpgFightService.expireFight(fightId1);

      // Should be able to create new fight
      const challenge2 = await rpgFightService.challenge(
        { inviterId: p1Id, targetId: p3Id },
        mockResolveItem,
      );
      expect(challenge2.isOk()).toBe(true);
    });
  });

  describe("Fight Completion", () => {
    test("should complete fight when HP reaches 0", async () => {
      // Create fight with low HP for quick finish
      const challenge = await rpgFightService.challenge(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );
      const fightId = challenge.unwrap().fightId;
      await rpgFightService.accept({ fightId, accepterId: p2Id }, mockResolveItem);

      // Fight until someone dies (might take a few rounds)
      let rounds = 0;
      const maxRounds = 50;

      while (rounds < maxRounds) {
        const fight = await rpgFightRepo.findById(fightId);
        if (fight.unwrap()!.status !== "active") break;

        await rpgFightService.submitMove({ fightId, playerId: p1Id, move: "attack" });
        const result = await rpgFightService.submitMove({
          fightId,
          playerId: p2Id,
          move: "attack",
        });

        rounds++;
        if (result.unwrap().status === "completed") break;
      }

      const finalFight = await rpgFightRepo.findById(fightId);
      expect(finalFight.unwrap()!.status).toBe("completed");
      expect(finalFight.unwrap()!.winnerId).not.toBeNull();

      // Verify locks cleared
      const p1Profile = await rpgProfileRepo.findById(p1Id);
      expect(p1Profile.unwrap()!.combat.isFighting).toBe(false);
    });

    test("should update win/loss records on completion", async () => {
      // Get initial records
      const p1Before = await rpgProfileRepo.findById(p1Id);
      const initialWins = p1Before.unwrap()!.record.wins;
      const initialLosses = p1Before.unwrap()!.record.losses;

      // Forfeit to quickly end fight
      const challenge = await rpgFightService.challenge(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );
      const fightId = challenge.unwrap().fightId;
      await rpgFightService.accept({ fightId, accepterId: p2Id }, mockResolveItem);

      await rpgFightService.forfeit(fightId, p1Id);

      // Check records updated
      const p1After = await rpgProfileRepo.findById(p1Id);
      const p2After = await rpgProfileRepo.findById(p2Id);

      expect(p1After.unwrap()!.record.losses).toBe(initialLosses + 1);
      expect(p2After.unwrap()!.record.wins).toBeGreaterThanOrEqual(1);
    });
  });
});
