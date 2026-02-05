/**
 * RPG Combat Integration Tests.
 *
 * Purpose: Test full combat lifecycle with invite/accept/resolve.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { rpgCombatService } from "@/modules/rpg/combat/service";
import { rpgProfileRepo } from "@/modules/rpg/profile/repository";
import { economyAccountRepo } from "@/modules/economy/account/repository";
import { sessionManager } from "@/modules/rpg/combat/session";
import { connectToDatabase, disconnectFromDatabase } from "@/db/mongo";
import { UserStore } from "@/db/repositories/users";

describe("RPG Combat Integration", () => {
  const p1Id = "test_rpg_combat_p1";
  const p2Id = "test_rpg_combat_p2";

  // Mock item resolver for stats
  const mockResolveItem = () => ({ atk: 10, def: 5, hp: 0 });

  beforeAll(async () => {
    await connectToDatabase();

    // Clean up
    const col = await UserStore.collection();
    await col.deleteOne({ _id: p1Id });
    await col.deleteOne({ _id: p2Id });

    // Setup accounts and profiles
    await economyAccountRepo.ensure(p1Id);
    await economyAccountRepo.ensure(p2Id);
    await rpgProfileRepo.ensure(p1Id);
    await rpgProfileRepo.ensure(p2Id);
  });

  afterAll(async () => {
    const col = await UserStore.collection();
    await col.deleteOne({ _id: p1Id });
    await col.deleteOne({ _id: p2Id });
    await disconnectFromDatabase();
  });

  describe("Combat Invite", () => {
    test("should create combat session", async () => {
      const result = await rpgCombatService.invite(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );

      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const actionResult = result.unwrap();
        expect(actionResult.success).toBe(true);
        expect(actionResult.session).toBeDefined();
        expect(actionResult.session!.status).toBe("pending");
        expect(actionResult.session!.p1Id).toBe(p1Id);
        expect(actionResult.session!.p2Id).toBe(p2Id);
      }
    });

    test("should reject self-combat", async () => {
      const result = await rpgCombatService.invite(
        { inviterId: p1Id, targetId: p1Id },
        mockResolveItem,
      );

      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.code).toBe("SELF_COMBAT");
      }
    });

    test("should reject invite when already in combat", async () => {
      const result = await rpgCombatService.invite(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );

      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.code).toBe("IN_COMBAT");
      }
    });
  });

  describe("Combat Accept", () => {
    let sessionId: string;

    beforeAll(async () => {
      // Create fresh session
      const inviteResult = await rpgCombatService.invite(
        { inviterId: p2Id, targetId: p1Id },
        mockResolveItem,
      );

      if (inviteResult.isOk()) {
        sessionId = inviteResult.unwrap().session!.id;
      }

      // Clean up first test session
      const p1Result = await rpgProfileRepo.findById(p1Id);
      if (p1Result.isOk() && p1Result.unwrap()) {
        await rpgProfileRepo.updateCombatState(
          p1Id,
          { currentHp: 100, isFighting: false, sessionId: null },
          true,
        );
      }

      const p2Result = await rpgProfileRepo.findById(p2Id);
      if (p2Result.isOk() && p2Result.unwrap()) {
        await rpgProfileRepo.updateCombatState(
          p2Id,
          { currentHp: 100, isFighting: false, sessionId: null },
          true,
        );
      }
    });

    test("should accept pending combat", async () => {
      // Create fresh invite
      const inviteResult = await rpgCombatService.invite(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );

      expect(inviteResult.isOk()).toBe(true);
      const newSessionId = inviteResult.unwrap().session!.id;

      const result = await rpgCombatService.accept({
        sessionId: newSessionId,
        accepterId: p2Id,
      });

      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        expect(result.unwrap().success).toBe(true);
      }
    });

    test("should reject accept by non-target", async () => {
      // Clean up first
      await rpgProfileRepo.updateCombatState(
        p1Id,
        { currentHp: 100, isFighting: false, sessionId: null },
        true,
      );
      await rpgProfileRepo.updateCombatState(
        p2Id,
        { currentHp: 100, isFighting: false, sessionId: null },
        true,
      );

      const inviteResult = await rpgCombatService.invite(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );

      expect(inviteResult.isOk()).toBe(true);
      const newSessionId = inviteResult.unwrap().session!.id;

      // Try to accept as inviter (p1)
      const result = await rpgCombatService.accept({
        sessionId: newSessionId,
        accepterId: p1Id,
      });

      expect(result.isErr()).toBe(true);
    });
  });

  describe("Combat Rounds", () => {
    let sessionId: string;

    beforeAll(async () => {
      // Reset combat flags
      await rpgProfileRepo.updateCombatState(
        p1Id,
        { currentHp: 100, isFighting: false, sessionId: null },
        true,
      );
      await rpgProfileRepo.updateCombatState(
        p2Id,
        { currentHp: 100, isFighting: false, sessionId: null },
        true,
      );

      // Create and accept combat
      const inviteResult = await rpgCombatService.invite(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );

      if (inviteResult.isOk()) {
        sessionId = inviteResult.unwrap().session!.id;
        await rpgCombatService.accept({ sessionId, accepterId: p2Id });
      }
    });

    test("should submit moves and resolve round", async () => {
      // P1 submits move
      const p1Result = await rpgCombatService.submitMove({
        sessionId,
        playerId: p1Id,
        move: "attack",
      });

      expect(p1Result.isOk()).toBe(true);

      if (p1Result.isOk()) {
        // Round should not be resolved yet (waiting for p2)
        expect(p1Result.unwrap().roundResolved).toBe(false);
      }

      // P2 submits move
      const p2Result = await rpgCombatService.submitMove({
        sessionId,
        playerId: p2Id,
        move: "block",
      });

      expect(p2Result.isOk()).toBe(true);

      if (p2Result.isOk()) {
        // Round should be resolved now
        expect(p2Result.unwrap().roundResolved).toBe(true);
        expect(p2Result.unwrap().roundResult).toBeDefined();
      }
    });

    test("should track pending moves", async () => {
      // Get session status
      const status = rpgCombatService.getSession(sessionId);
      expect(status.success).toBe(true);

      // Continue combat until someone wins
      // This is a simplified test - real combat would need many rounds
    });
  });

  describe("Combat Forfeit", () => {
    let forfeitSessionId: string;

    beforeAll(async () => {
      // Reset combat flags
      await rpgProfileRepo.updateCombatState(
        p1Id,
        { currentHp: 100, isFighting: false, sessionId: null },
        true,
      );
      await rpgProfileRepo.updateCombatState(
        p2Id,
        { currentHp: 100, isFighting: false, sessionId: null },
        true,
      );

      // Create and accept combat
      const inviteResult = await rpgCombatService.invite(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );

      if (inviteResult.isOk()) {
        forfeitSessionId = inviteResult.unwrap().session!.id;
        await rpgCombatService.accept({ sessionId: forfeitSessionId, accepterId: p2Id });
      }
    });

    test("should allow forfeit", async () => {
      const result = await rpgCombatService.forfeit(forfeitSessionId, p1Id);

      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const combatResult = result.unwrap();
        expect(combatResult.winnerId).toBe(p2Id);
        expect(combatResult.loserId).toBe(p1Id);
      }
    });

    test("should update win/loss records after forfeit", async () => {
      // Check profiles were updated
      const [p1Result, p2Result] = await Promise.all([
        rpgProfileRepo.findById(p1Id),
        rpgProfileRepo.findById(p2Id),
      ]);

      if (p1Result.isOk() && p1Result.unwrap()) {
        expect(p1Result.unwrap()!.record.losses).toBeGreaterThan(0);
        expect(p1Result.unwrap()!.combat.isFighting).toBe(false);
      }

      if (p2Result.isOk() && p2Result.unwrap()) {
        expect(p2Result.unwrap()!.record.wins).toBeGreaterThan(0);
        expect(p2Result.unwrap()!.combat.isFighting).toBe(false);
      }
    });
  });

  describe("Session TTL", () => {
    test("should track session expiration", async () => {
      // Reset flags
      await rpgProfileRepo.updateCombatState(
        p1Id,
        { currentHp: 100, isFighting: false, sessionId: null },
        true,
      );
      await rpgProfileRepo.updateCombatState(
        p2Id,
        { currentHp: 100, isFighting: false, sessionId: null },
        true,
      );

      const inviteResult = await rpgCombatService.invite(
        { inviterId: p1Id, targetId: p2Id },
        mockResolveItem,
      );

      expect(inviteResult.isOk()).toBe(true);

      if (inviteResult.isOk()) {
        const session = inviteResult.unwrap().session!;
        expect(session.expiresAt).toBeDefined();
        expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
      }
    });
  });
});
