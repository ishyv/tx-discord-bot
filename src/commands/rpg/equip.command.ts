/**
 * RPG Equip Subcommand (Refactored for Phase 12.2).
 *
 * Purpose: Equip items from inventory to RPG equipment slots.
 * Context: Changes RPG equipment with combat lock check and preview.
 */
import {
  Declare,
  SubCommand,
  Command,
  type GuildCommandContext,
  createStringOption,
  Embed,
  ActionRow,
  type ComponentContext,
} from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";
import { rpgEquipmentService } from "@/modules/rpg/equipment/service";
import { rpgProfileRepo } from "@/modules/rpg/profile/repository";
import { normalizeModernInventory } from "@/modules/inventory/inventory";
import { buildInventoryView } from "@/modules/inventory/instances";
import { getItemDefinition, getToolMaxDurability } from "@/modules/inventory/items";
import { StatsCalculator } from "@/modules/rpg/stats/calculator";
import { EQUIPMENT_SLOTS } from "@/modules/rpg/config";
import type { EquipmentSlot, Loadout } from "@/db/schemas/rpg-profile";
import {
  createButton,
  createSelectMenu,
  replyEphemeral,
  getContextInfo,
} from "@/adapters/seyfert";
import { UIColors } from "@/modules/ui/design-system";
import { formatDelta, renderProgressBar } from "@/modules/economy/account/formatting";

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
  description: "⚔️ Equip RPG gear (weapons, armor). For economy items use /equip",
})
export default class RpgEquipSubcommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof slotOption>) {
    const { userId } = getContextInfo(ctx);

    // Check profile exists
    const profileResult = await rpgProfileRepo.findById(userId);
    if (profileResult.isErr() || !profileResult.unwrap()) {
      await replyEphemeral(ctx, {
        content:
          "❌ You need an RPG profile first! Use `/rpg profile` to create one.",
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
  ctx: GuildCommandContext | ComponentContext,
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
    .setColor(UIColors.info)
    .setTitle("⚔️ Select Equipment Slot")
    .setDescription("Choose a slot to equip an item to.");

  // Show current equipment
  for (const slot of EQUIPMENT_SLOTS) {
    const equipped = loadout[slot];
    const emoji = SLOT_EMOJIS[slot] || "📦";

    let itemId: string | null = null;
    let details = "";

    if (equipped) {
      if (typeof equipped === "string") {
        itemId = equipped;
      } else {
        itemId = equipped.itemId;
        const def = getItemDefinition(itemId);
        const max = (def && getToolMaxDurability(def)) || 100;
        const percent = (equipped.durability / max) * 100;
        const bar = renderProgressBar(percent, 5);
        details = ` ${bar} \`${equipped.durability}\``;
      }
    }

    if (itemId) {
      const def = getItemDefinition(itemId);
      embed.addFields({
        name: `${emoji} ${slot.charAt(0).toUpperCase() + slot.slice(1)}`,
        value: `${def?.emoji ?? "📦"} **${def?.name ?? itemId}**${details}`,
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

  // @ts-ignore
  await ctx.write({
    embeds: [embed],
    components: [row],
    flags: 64, // Ephemeral
  });
}

async function showSlotItems(
  ctx: GuildCommandContext | ComponentContext,
  userId: string,
  slot: EquipmentSlot,
) {
  // Get inventory
  const { UserStore } = await import("@/db/repositories/users");
  const userResult = await UserStore.get(userId);

  if (userResult.isErr() || !userResult.unwrap()) {
    // @ts-ignore
    await replyEphemeral(ctx, { content: "Could not load your inventory." });
    return;
  }

  const inventory = normalizeModernInventory(userResult.unwrap()!.inventory);
  const view = buildInventoryView(inventory); // This builds flat list of items/instances

  // Filter items that can go in this slot
  const equippableItems = view.filter((entry) => {
    const def = getItemDefinition(entry.itemId);
    if (!def) return false;
    // Check if item can be equipped to this slot
    if (def.rpgSlot === slot) return true;
    return false;
  });

  if (equippableItems.length === 0) {
    // @ts-ignore
    await replyEphemeral(ctx, {
      content: `❌ You don't have any items that can be equipped to **${slot}**.`,
    });
    return;
  }

  const embed = new Embed()
    .setColor(UIColors.amethyst)
    .setTitle(`Equip to ${slot.charAt(0).toUpperCase() + slot.slice(1)}`)
    .setDescription("Select an item to preview stats:");

  // Flatten items into options, expanding instances
  const selectOptions: { label: string; value: string; description: string }[] =
    [];

  for (const entry of equippableItems) {
    const def = getItemDefinition(entry.itemId);
    const name = def?.name ?? entry.itemId;
    const maxDur = def ? (getToolMaxDurability(def) || 100) : 100;

    if (entry.isInstanceBased && entry.instances) {
      for (const inst of entry.instances) {
        selectOptions.push({
          label: `${name} #${inst.instanceId.slice(-6)}`,
          value: `${entry.itemId}:${inst.instanceId}`,
          description: `Durability: ${inst.durability}/${maxDur}`,
        });
      }
    } else {
      // Stackable gear (rare)
      selectOptions.push({
        label: name,
        value: entry.itemId,
        description: `Quantity: ${entry.quantity}`,
      });
    }
  }

  // Slice to 25 max for select menu
  const finalOptions = selectOptions.slice(0, 25);

  if (finalOptions.length === 0) {
    // @ts-ignore
    await replyEphemeral(ctx, { content: "No valid items found to equip." });
    return;
  }

  const selectMenu = createSelectMenu({
    customId: `rpg_equip_item_${userId}_${slot}`,
    placeholder: "Select an item to preview...",
    options: finalOptions,
  });

  const row = new ActionRow<typeof selectMenu>().addComponents(selectMenu);

  const backBtn = createButton({
    customId: `rpg_equip_back_${userId}`,
    label: "← Back",
    style: ButtonStyle.Secondary,
  });

  const row2 = new ActionRow<typeof backBtn>().addComponents(backBtn);

  // @ts-ignore
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
export class RpgEquipSlotHandler extends Command {
  // @ts-ignore
  async run(ctx: ComponentContext) {
    // @ts-ignore
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
  description: "Handle item selection for preview",
})
export class RpgEquipItemHandler extends Command {
  // @ts-ignore
  async run(ctx: ComponentContext) {
    // @ts-ignore
    const { userId } = getContextInfo(ctx);

    // @ts-ignore - custom_id access
    const customId = ctx.customId as string;
    const parts = customId.split("_");
    const slot = parts[parts.length - 1] as EquipmentSlot;

    // @ts-ignore - values access
    const selectedValue = ctx.values?.[0] as string | undefined;
    if (!selectedValue) {
      // @ts-ignore
      await replyEphemeral(ctx, { content: "No item selected." });
      return;
    }

    const [itemId, instanceId] = selectedValue.split(":");
    const def = getItemDefinition(itemId);

    if (!def) {
      // @ts-ignore
      await replyEphemeral(ctx, { content: "Item definition not found." });
      return;
    }

    // Calculate stats delta
    const profileResult = await rpgProfileRepo.findById(userId);
    if (profileResult.isErr() || !profileResult.unwrap()) {
      // @ts-ignore
      await replyEphemeral(ctx, { content: "Profile not found." });
      return;
    }
    const profile = profileResult.unwrap()!;

    // Resolve stats helper
    const resolveStats = (id: string) => getItemDefinition(id)?.stats || null;

    // Simulate new loadout
    const currentLoadout = { ...profile.loadout };
    const newLoadout = { ...profile.loadout };

    newLoadout[slot] = instanceId
      ? { itemId, instanceId, durability: 999 } // Mock for stats (durability doesn't affect stats)
      : itemId;

    const delta = StatsCalculator.calculateDelta(
      currentLoadout,
      newLoadout,
      resolveStats,
    );

    const embed = new Embed()
      .setColor(UIColors.info)
      .setTitle("🛡️ Equip Preview")
      .setDescription(
        `Equipping **${def.name}** to **${slot}** slot.\nCheck the stat changes below.`,
      );

    const statsText = [];
    if (delta.atkDelta !== 0)
      statsText.push(`⚔️ ATK: ${formatDelta(delta.atkDelta)}`);
    if (delta.defDelta !== 0)
      statsText.push(`🛡️ DEF: ${formatDelta(delta.defDelta)}`);
    if (delta.maxHpDelta !== 0)
      statsText.push(`❤️ HP: ${formatDelta(delta.maxHpDelta)}`);

    if (statsText.length === 0) {
      embed.addFields({ name: "Stats Change", value: "No change", inline: true });
    } else {
      embed.addFields({
        name: "Stats Change",
        value: statsText.join("\n"),
        inline: true,
      });
    }

    // Confirm button
    const confirmBtn = createButton({
      customId: `rpg_equip_confirm_${userId}_${slot}_${itemId}_${instanceId || "none"}`,
      label: "✅ Confirm & Equip",
      style: ButtonStyle.Success,
    });

    const cancelBtn = createButton({
      customId: `rpg_equip_back_${userId}`,
      label: "❌ Cancel",
      style: ButtonStyle.Secondary,
    });

    const row = new ActionRow<typeof confirmBtn>().addComponents(
      confirmBtn,
      cancelBtn,
    );

    // @ts-ignore
    await ctx.write({
      embeds: [embed],
      components: [row],
      flags: 64,
    });
  }
}

@Declare({
  name: "rpg_equip_confirm",
  description: "Confirm and execute equip",
})
export class RpgEquipConfirmHandler extends Command {
  // @ts-ignore
  async run(ctx: ComponentContext) {
    // @ts-ignore
    const { userId } = getContextInfo(ctx);
    // @ts-ignore
    const customId = ctx.customId as string;
    const parts = customId.split("_");
    // rpg_equip_confirm_userId_slot_itemId_instanceId
    // Parts: 0=rpg, 1=equip, 2=confirm, 3=userId, 4=slot, 5=itemId, 6=instanceId

    // We need to match userId from context to ensure safety
    const targetUserId = parts[3];
    if (userId !== targetUserId) {
      // @ts-ignore
      await replyEphemeral(ctx, { content: "This is not your button." });
      return;
    }

    const slot = parts[4] as EquipmentSlot;
    const itemId = parts[5];
    const instanceIdRaw = parts[6];
    const instanceId = instanceIdRaw === "none" ? undefined : instanceIdRaw;

    // Execute equip
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

      // @ts-ignore
      await replyEphemeral(ctx, {
        content: messages[error.code ?? ""] ?? `❌ ${error.message}`,
      });
      return;
    }

    const def = getItemDefinition(itemId);
    const embed = new Embed()
      .setColor(UIColors.success)
      .setTitle("✅ Equipped!")
      .setDescription(
        `Successfully equipped **${def?.name ?? itemId}** to **${slot}**.`
      );

    // @ts-ignore
    await ctx.write({
      embeds: [embed],
      components: [], // Clear buttons
      flags: 64,
    });
  }
}

@Declare({
  name: "rpg_equip_back",
  description: "Back to slot selection",
})
export class RpgEquipBackHandler extends Command {
  // @ts-ignore
  async run(ctx: ComponentContext) {
    // @ts-ignore
    const { userId } = getContextInfo(ctx);

    const profileResult = await rpgProfileRepo.findById(userId);
    if (profileResult.isOk() && profileResult.unwrap()) {
      await showSlotSelection(ctx, userId, profileResult.unwrap()!.loadout);
    }
  }
}
