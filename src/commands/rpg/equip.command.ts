/**
 * RPG Equip Subcommand.
 *
 * Purpose: Equip items from inventory to RPG equipment slots.
 * Context: Changes RPG equipment with combat lock check.
 */
import {
  Declare,
  SubCommand,
  type GuildCommandContext,
  createStringOption,
  Embed,
  ActionRow,
} from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";
import { rpgEquipmentService } from "@/modules/rpg/equipment/service";
import { rpgProfileRepo } from "@/modules/rpg/profile/repository";
import { normalizeModernInventory } from "@/modules/inventory/inventory";
import { buildInventoryView } from "@/modules/inventory/instances";
import { getItemDefinition } from "@/modules/inventory/items";
import { EQUIPMENT_SLOTS } from "@/modules/rpg/config";
import type { EquipmentSlot, Loadout } from "@/db/schemas/rpg-profile";
import { createButton, createSelectMenu, replyEphemeral, getContextInfo } from "@/adapters/seyfert";

const slotOption = {
  slot: createStringOption({
    description: "Equipment slot",
    required: false,
    choices: EQUIPMENT_SLOTS.map((s) => ({
      name: s.charAt(0).toUpperCase() + s.slice(1),
      value: s,
    })),
  }),
};

@Declare({
  name: "equip",
  description: "Equip an item from your inventory",
})
export default class RpgEquipSubcommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof slotOption>) {
    const { userId } = getContextInfo(ctx);

    // Check profile exists
    const profileResult = await rpgProfileRepo.findById(userId);
    if (profileResult.isErr() || !profileResult.unwrap()) {
      await replyEphemeral(ctx, {
        content: "❌ You need an RPG profile first! Use `/rpg profile` to create one.",
      });
      return;
    }

    const profile = profileResult.unwrap()!;

    // Check combat lock
    if (profile.isFighting) {
      await replyEphemeral(ctx, {
        content: "❌ You cannot change equipment while in combat!",
      });
      return;
    }

    const selectedSlot = ctx.options.slot as EquipmentSlot | undefined;

    if (selectedSlot) {
      await showSlotItems(ctx, userId, selectedSlot);
    } else {
      await showSlotSelection(ctx, userId, profile.loadout);
    }
  }
}

async function showSlotSelection(
  ctx: GuildCommandContext,
  userId: string,
  loadout: Loadout,
) {
  const SLOT_EMOJIS: Record<EquipmentSlot, string> = {
    weapon: "⚔️",
    shield: "🛡️",
    helmet: "⛑️",
    chest: "👕",
    pants: "👖",
    boots: "👢",
    ring: "💍",
    necklace: "📿",
  };

  const embed = new Embed()
    .setColor(0x3498db)
    .setTitle("⚔️ Select Equipment Slot")
    .setDescription("Choose a slot to equip an item to.");

  // Show current equipment
  for (const slot of EQUIPMENT_SLOTS) {
    const equipped = loadout[slot];
    const emoji = SLOT_EMOJIS[slot];

    let itemId: string | null = null;
    let details = "";

    if (equipped) {
      if (typeof equipped === "string") {
        itemId = equipped;
      } else {
        itemId = equipped.itemId;
        details = ` (Dur: ${equipped.durability})`;
      }
    }

    if (itemId) {
      const def = getItemDefinition(itemId);
      embed.addFields({
        name: `${emoji} ${slot.charAt(0).toUpperCase() + slot.slice(1)}`,
        value: `${def?.emoji ?? "📦"} ${def?.name ?? itemId}${details}`,
        inline: true,
      });
    } else {
      embed.addFields({
        name: `${emoji} ${slot.charAt(0).toUpperCase() + slot.slice(1)}`,
        value: "*Empty*",
        inline: true,
      });
    }
  }

  const selectOptions = EQUIPMENT_SLOTS.map((slot) => {
    const equipped = loadout[slot];
    let itemName = "Equipped";

    if (equipped) {
      if (typeof equipped === "string") {
        itemName = getItemDefinition(equipped)?.name ?? equipped;
      } else {
        itemName = getItemDefinition(equipped.itemId)?.name ?? equipped.itemId;
      }
    }

    return {
      label: slot.charAt(0).toUpperCase() + slot.slice(1),
      value: slot,
      description: equipped
        ? `Replace: ${itemName}`
        : "Empty slot - Equip item",
    };
  });

  const selectMenu = createSelectMenu({
    customId: `rpg_equip_slot_${userId}`,
    placeholder: "Select a slot...",
    options: selectOptions,
  });

  const row = new ActionRow<typeof selectMenu>().addComponents(selectMenu);

  await ctx.write({
    embeds: [embed],
    components: [row],
    flags: 64, // Ephemeral
  });
}

async function showSlotItems(
  ctx: GuildCommandContext,
  userId: string,
  slot: EquipmentSlot,
) {
  // Get inventory
  const { UserStore } = await import("@/db/repositories/users");
  const userResult = await UserStore.get(userId);
  if (userResult.isErr() || !userResult.unwrap()) {
    await replyEphemeral(ctx, { content: "Could not load your inventory." });
    return;
  }

  const inventory = normalizeModernInventory(userResult.unwrap()!.inventory);
  const view = buildInventoryView(inventory);

  // Filter items that can go in this slot
  const equippableItems = view.filter((entry) => {
    const def = getItemDefinition(entry.itemId);
    if (!def) return false;
    // Check if item can be equipped to this slot
    if (def.rpgSlot === slot) return true;
    if (slot === "weapon" && def.rpgSlot === "tool") return true;
    return false;
  });

  if (equippableItems.length === 0) {
    await replyEphemeral(ctx, {
      content: `❌ You don't have any items that can be equipped to **${slot}**.`,
    });
    return;
  }

  const embed = new Embed()
    .setColor(0x9b59b6)
    .setTitle(`Equip to ${slot.charAt(0).toUpperCase() + slot.slice(1)}`)
    .setDescription("Select an item to equip:");

  for (const item of equippableItems.slice(0, 10)) {
    const def = getItemDefinition(item.itemId);
    const statsText: string[] = [];
    if (def?.stats?.atk) statsText.push(`⚔️ +${def.stats.atk} ATK`);
    if (def?.stats?.def) statsText.push(`🛡️ +${def.stats.def} DEF`);
    if (def?.stats?.hp) statsText.push(`❤️ +${def.stats.hp} HP`);

    embed.addFields({
      name: `${def?.emoji ?? "📦"} ${def?.name ?? item.itemId}`,
      value: statsText.length > 0 ? statsText.join(" ") : "No stats",
      inline: false,
    });
  }

  // Flatten items into options, expanding instances
  const selectOptions: { label: string; value: string; description: string }[] = [];

  for (const entry of equippableItems) {
    const def = getItemDefinition(entry.itemId);
    const name = def?.name ?? entry.itemId;

    if (entry.isInstanceBased && entry.instances) {
      for (const inst of entry.instances) {
        selectOptions.push({
          label: `${name} (Dur: ${inst.durability})`,
          value: `${entry.itemId}:${inst.instanceId}`,
          description: `Equip specific instance`
        });
      }
    } else {
      selectOptions.push({
        label: name,
        value: entry.itemId,
        description: `Quantity: ${entry.quantity}`
      });
    }
  }

  // Slice to 25 max for select menu
  const finalOptions = selectOptions.slice(0, 25);

  if (finalOptions.length === 0) {
    await replyEphemeral(ctx, { content: "No valid items found to equip." });
    return;
  }

  const selectMenu = createSelectMenu({
    customId: `rpg_equip_item_${userId}_${slot}`,
    placeholder: "Select an item...",
    options: finalOptions,
  });

  const row = new ActionRow<typeof selectMenu>().addComponents(selectMenu);

  const backBtn = createButton({
    customId: `rpg_equip_back_${userId}`,
    label: "← Back",
    style: ButtonStyle.Secondary,
  });

  const row2 = new ActionRow<typeof backBtn>().addComponents(backBtn);

  await ctx.write({
    embeds: [embed],
    components: [row, row2],
    flags: 64,
  });
}

// Component handlers
@Declare({
  name: "rpg_equip_slot",
  description: "Handle slot selection",
})
export class RpgEquipSlotHandler extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const { userId } = getContextInfo(ctx);

    // @ts-ignore - custom_id access
    const customId = ctx.customId as string;
    const slot = customId.split("_").pop() as EquipmentSlot;

    if (!slot || !EQUIPMENT_SLOTS.includes(slot)) return;

    await showSlotItems(ctx, userId, slot);
  }
}

@Declare({
  name: "rpg_equip_item",
  description: "Handle item selection",
})
export class RpgEquipItemHandler extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const { userId } = getContextInfo(ctx);

    // @ts-ignore - custom_id access
    const customId = ctx.customId as string;
    const parts = customId.split("_");
    const slot = parts[parts.length - 1] as EquipmentSlot;

    // @ts-ignore - values access
    const selectedValue = ctx.values?.[0] as string | undefined;
    if (!selectedValue) {
      await replyEphemeral(ctx, { content: "No item selected." });
      return;
    }

    // Parse value which might be "itemId:instanceId" or just "itemId"
    const [itemId, instanceId] = selectedValue.split(":");

    // Equip the item
    const result = await rpgEquipmentService.equip({
      userId,
      itemId,
      instanceId,
      slot,
      actorId: userId,
    });

    if (result.isErr()) {
      const error = result.error as { code?: string; message: string };
      const messages: Record<string, string> = {
        IN_COMBAT: "❌ You cannot change equipment while in combat!",
        ITEM_NOT_IN_INVENTORY: "❌ Item not found in your inventory.",
        UPDATE_FAILED: "❌ Failed to equip item.",
      };

      await replyEphemeral(ctx, {
        content: messages[error.code ?? ""] ?? `❌ ${error.message}`,
      });
      return;
    }

    const def = getItemDefinition(itemId);
    await replyEphemeral(ctx, {
      content: `✅ Equipped **${def?.name ?? itemId}** to **${slot}**.`,
    });
  }
}

@Declare({
  name: "rpg_equip_back",
  description: "Back to slot selection",
})
export class RpgEquipBackHandler extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const { userId } = getContextInfo(ctx);

    const profileResult = await rpgProfileRepo.findById(userId);
    if (profileResult.isOk() && profileResult.unwrap()) {
      await showSlotSelection(ctx, userId, profileResult.unwrap()!.loadout);
    }
  }
}
