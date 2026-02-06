import { afterAll, beforeAll, describe, expect, it } from "bun:test";

const RUN_DB_INTEGRATION = Bun.env.RUN_DB_INTEGRATION === "1";

if (!RUN_DB_INTEGRATION) {
  describe("content packs integration", () => {
    it("is disabled by default (set RUN_DB_INTEGRATION=1)", () => {
      expect(true).toBe(true);
    });
  });
} else {
  // Lazy imports so the file remains non-blocking when DB integration is disabled.
  const { UserStore } = await import("@/db/repositories/users");
  const {
    loadContentRegistryOrThrow,
    resetContentRegistryForTests,
  } = await import("@/modules/content");
  const { rpgProfileRepo } = await import("@/modules/rpg/profile/repository");
  const { itemInstanceService } = await import(
    "@/modules/economy/mutations/items/instance-service"
  );
  const { rpgEquipmentService } = await import("@/modules/rpg/equipment/service");
  const { rpgGatheringService } = await import("@/modules/rpg/gathering/service");
  const { craftingService } = await import("@/modules/economy/crafting/service");
  const { itemMutationService } = await import(
    "@/modules/economy/mutations/items/service"
  );
  const { normalizeModernInventory, getModernItemQuantity } = await import(
    "@/modules/inventory/inventory"
  );

  const GUILD_ID = "content_pack_guild";
  const ACTOR_ID = "content_pack_actor";
  const MINING_USER_ID = "content_pack_mining_user";
  const CRAFT_USER_ID = "content_pack_craft_user";

  async function allowAll(): Promise<boolean> {
    return true;
  }

  async function ensureUserAndProfile(userId: string): Promise<void> {
    await UserStore.ensure(userId);
    await rpgProfileRepo.ensure(userId);
  }

  async function cleanupUser(userId: string): Promise<void> {
    await UserStore.delete(userId);
  }

  async function getModernInventory(userId: string) {
    const userResult = await UserStore.get(userId);
    const user = userResult.isOk() ? userResult.unwrap() : null;
    return normalizeModernInventory(user?.inventory ?? {});
  }

  describe("content packs integration", () => {
    beforeAll(async () => {
      resetContentRegistryForTests();
      await loadContentRegistryOrThrow();
      await ensureUserAndProfile(MINING_USER_ID);
      await ensureUserAndProfile(CRAFT_USER_ID);
    });

    afterAll(async () => {
      await cleanupUser(MINING_USER_ID);
      await cleanupUser(CRAFT_USER_ID);
    });

    it("loads content packs successfully", async () => {
      const registry = await loadContentRegistryOrThrow();
      expect(registry.getItem("pyrite_ore")).toBeTruthy();
      expect(registry.getRecipe("craft_miner_pickaxe_t2")).toBeTruthy();
      expect(registry.getLocationById("silver_mine")).toBeTruthy();
    });

    it("mining at tier 4 can roll a tier 3 material from content drop tables", async () => {
      await cleanupUser(MINING_USER_ID);
      await ensureUserAndProfile(MINING_USER_ID);

      const grantResult = await itemInstanceService.grantInstance({
        actorId: ACTOR_ID,
        targetId: MINING_USER_ID,
        guildId: GUILD_ID,
        itemId: "pickaxe_lv4",
        durability: 70,
      });
      expect(grantResult.isOk()).toBe(true);

      const equipResult = await rpgEquipmentService.equip({
        userId: MINING_USER_ID,
        actorId: ACTOR_ID,
        guildId: GUILD_ID,
        slot: "weapon",
        itemId: "pickaxe_lv4",
      });
      expect(equipResult.isOk()).toBe(true);

      const originalRandom = Math.random;
      const sequence = [0.1234, 0.2, 0.8, 0.8, 0.1];
      let cursor = 0;
      Math.random = () => sequence[cursor++] ?? 0.99;

      try {
        const result = await rpgGatheringService.mine(
          MINING_USER_ID,
          "silver_mine",
          ACTOR_ID,
          GUILD_ID,
        );

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          const gathered = result.unwrap();
          expect(gathered.tier).toBe(4);
          expect(gathered.materialsGained[0]?.id).toBe("moon_silver_ore");
        }
      } finally {
        Math.random = originalRandom;
      }
    });

    it("crafting consumes inputs and grants outputs from content definitions", async () => {
      await cleanupUser(CRAFT_USER_ID);
      await ensureUserAndProfile(CRAFT_USER_ID);

      await UserStore.patch(CRAFT_USER_ID, {
        "rpgProfile.starterKitType": "miner",
        currency: {
          coins: { hand: 5000, bank: 0, use_total_on_subtract: false },
        },
      } as any);

      await itemMutationService.adjustItemQuantity(
        {
          actorId: ACTOR_ID,
          targetId: CRAFT_USER_ID,
          guildId: GUILD_ID,
          itemId: "pyrite_ingot",
          delta: 8,
          reason: "content craft setup",
        },
        allowAll,
      );
      await itemMutationService.adjustItemQuantity(
        {
          actorId: ACTOR_ID,
          targetId: CRAFT_USER_ID,
          guildId: GUILD_ID,
          itemId: "resin_pine_plank",
          delta: 4,
          reason: "content craft setup",
        },
        allowAll,
      );

      const starterToolResult = await itemInstanceService.grantInstance({
        actorId: ACTOR_ID,
        targetId: CRAFT_USER_ID,
        guildId: GUILD_ID,
        itemId: "pickaxe",
        durability: 10,
        reason: "content craft setup",
      });
      expect(starterToolResult.isOk()).toBe(true);

      const equipResult = await rpgEquipmentService.equip({
        userId: CRAFT_USER_ID,
        actorId: ACTOR_ID,
        guildId: GUILD_ID,
        slot: "weapon",
        itemId: "pickaxe",
      });
      expect(equipResult.isOk()).toBe(true);

      const beforeInventory = await getModernInventory(CRAFT_USER_ID);
      const beforeIngot = getModernItemQuantity(beforeInventory, "pyrite_ingot");
      const beforePlank = getModernItemQuantity(beforeInventory, "resin_pine_plank");
      const beforePickaxeLv2 = getModernItemQuantity(beforeInventory, "pickaxe_lv2");

      const craftResult = await craftingService.craft({
        guildId: GUILD_ID,
        userId: CRAFT_USER_ID,
        recipeId: "craft_miner_pickaxe_t2",
        quantity: 1,
      });

      expect(craftResult.isOk()).toBe(true);

      const afterInventory = await getModernInventory(CRAFT_USER_ID);
      expect(getModernItemQuantity(afterInventory, "pyrite_ingot")).toBe(beforeIngot - 8);
      expect(getModernItemQuantity(afterInventory, "resin_pine_plank")).toBe(beforePlank - 4);
      expect(getModernItemQuantity(afterInventory, "pickaxe_lv2")).toBe(beforePickaxeLv2 + 1);
    });
  });
}
