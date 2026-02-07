/**
 * RPG Unequip Subcommand.
 *
 * Purpose: Remove equipped items and return them to inventory.
 * Context: Unequips items with combat lock check.
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
import { getItemDefinition } from "@/modules/inventory/items";
import { EQUIPMENT_SLOTS } from "@/modules/rpg/config";
import type { EquipmentSlot, Loadout } from "@/db/schemas/rpg-profile";
import { createButton, replyEphemeral, getContextInfo } from "@/adapters/seyfert";

const slotOption = {
  slot: createStringOption({
    description: "Equipment slot to unequip",
    required: false,
    choices: EQUIPMENT_SLOTS.map((s) => ({
      name: s.charAt(0).toUpperCase() + s.slice(1),
      value: s,
    })),
  }),
};

@Declare({
  name: "unequip",
  description: "⚔️ Unequip RPG weapons and armor",
})
export default class RpgUnequipSubcommand extends SubCommand {
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
      // Direct unequip
      await promptUnequip(ctx, userId, selectedSlot, profile.loadout[selectedSlot]);
    } else {
      // Show equipped slots
      await showEquippedSlots(ctx, userId, profile.loadout);
    }
  }
}

async function showEquippedSlots(
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

  const equippedSlots = EQUIPMENT_SLOTS.filter((slot) => loadout[slot]);

  if (equippedSlots.length === 0) {
    await replyEphemeral(ctx, { content: "❌ You don't have any items equipped." });
    return;
  }

  const embed = new Embed()
    .setColor(0xe74c3c)
    .setTitle("🔧 Select Slot to Unequip")
    .setDescription("Click a button to unequip that item.");

  for (const slot of equippedSlots) {
    const equipped = loadout[slot];
    let itemId = "";

    if (equipped) {
      if (typeof equipped === "string") {
        itemId = equipped;
      } else {
        itemId = equipped.itemId;
      }
    }

    const def = getItemDefinition(itemId);
    embed.addFields({
      name: `${SLOT_EMOJIS[slot]} ${slot.charAt(0).toUpperCase() + slot.slice(1)}`,
      value: `${def?.emoji ?? "📦"} ${def?.name ?? itemId}`,
      inline: true,
    });
  }

  // Create buttons for equipped slots
  const rows: ActionRow<ReturnType<typeof createButton>>[] = [];
  let currentRow = new ActionRow<ReturnType<typeof createButton>>();

  for (let i = 0; i < equippedSlots.length; i++) {
    const slot = equippedSlots[i];
    const btn = createButton({
      customId: `rpg_unequip_slot_${userId}_${slot}`,
      label: slot.charAt(0).toUpperCase() + slot.slice(1),
      style: ButtonStyle.Primary,
    });

    currentRow.addComponents(btn);

    if (currentRow.components.length >= 5 || i === equippedSlots.length - 1) {
      rows.push(currentRow);
      currentRow = new ActionRow<ReturnType<typeof createButton>>();
    }
  }

  await ctx.write({
    embeds: [embed],
    components: rows,
    flags: 64,
  });
}

async function promptUnequip(
  ctx: GuildCommandContext,
  userId: string,
  slot: EquipmentSlot,
  itemData: string | { itemId: string } | null,
) {
  if (!itemData) {
    await replyEphemeral(ctx, { content: `❌ Nothing equipped in ${slot}.` });
    return;
  }

  const itemId = typeof itemData === "string" ? itemData : itemData.itemId;
  const def = getItemDefinition(itemId);

  const embed = new Embed()
    .setColor(0xf39c12)
    .setTitle("🔧 Confirm Unequip")
    .setDescription(
      `Unequip **${def?.emoji ?? "📦"} ${def?.name ?? itemId}** from **${slot}**?\n\n` +
      "The item will return to your inventory.",
    );

  const confirmBtn = createButton({
    customId: `rpg_unequip_confirm_${userId}_${slot}`,
    label: "✓ Unequip",
    style: ButtonStyle.Success,
  });

  const cancelBtn = createButton({
    customId: `rpg_unequip_cancel_${userId}`,
    label: "✕ Cancel",
    style: ButtonStyle.Secondary,
  });

  const row = new ActionRow<typeof confirmBtn>().addComponents(confirmBtn, cancelBtn);

  await ctx.write({
    embeds: [embed],
    components: [row],
    flags: 64,
  });
}

// Component handlers
@Declare({
  name: "rpg_unequip_slot",
  description: "Handle slot button for unequip",
})
export class RpgUnequipSlotHandler extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const { userId } = getContextInfo(ctx);

    // @ts-ignore - custom_id access
    const customId = ctx.customId as string;
    const slot = customId.split("_").pop() as EquipmentSlot;

    if (!slot || !EQUIPMENT_SLOTS.includes(slot)) return;

    const profileResult = await rpgProfileRepo.findById(userId);
    if (profileResult.isOk() && profileResult.unwrap()) {
      const loadout = profileResult.unwrap()!.loadout;
      await promptUnequip(ctx, userId, slot, loadout[slot]);
    }
  }
}

@Declare({
  name: "rpg_unequip_confirm",
  description: "Confirm unequip",
})
export class RpgUnequipConfirmHandler extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const { userId } = getContextInfo(ctx);

    // @ts-ignore - custom_id access
    const customId = ctx.customId as string;
    const parts = customId.split("_");
    const slot = parts[parts.length - 1] as EquipmentSlot;

    if (!slot || !EQUIPMENT_SLOTS.includes(slot)) return;

    // Unequip the item
    const result = await rpgEquipmentService.unequip(userId, userId, slot);

    if (result.isErr()) {
      const error = result.error as { code?: string; message: string };
      const messages: Record<string, string> = {
        IN_COMBAT: "❌ You cannot change equipment while in combat!",
        SLOT_EMPTY: `❌ Nothing equipped in ${slot}.`,
        UPDATE_FAILED: "❌ Failed to unequip item.",
      };

      await replyEphemeral(ctx, {
        content: messages[error.code ?? ""] ?? `❌ ${error.message}`,
      });
      return;
    }

    const operation = result.unwrap();
    const def = getItemDefinition(operation.previousItemId ?? "");

    await replyEphemeral(ctx, {
      content: `✅ Unequipped **${def?.name ?? operation.previousItemId}** from **${slot}**. Item returned to inventory.`,
    });
  }
}

@Declare({
  name: "rpg_unequip_cancel",
  description: "Cancel unequip",
})
export class RpgUnequipCancelHandler extends SubCommand {
  async run(ctx: GuildCommandContext) {
    await replyEphemeral(ctx, { content: "❌ Unequip cancelled." });
  }
}
