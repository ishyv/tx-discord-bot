/**
 * Trinkets Unequip Command.
 *
 * Purpose: Remove equipped trinkets, rings, and necklaces.
 */
import {
  Command,
  Declare,
  SubCommand,
  type GuildCommandContext,
  createStringOption,
  Embed,
  ActionRow,
} from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";
import { EmbedColors } from "seyfert/lib/common";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
  equipmentService,
  getSlotDisplayName,
  SLOT_DISPLAY_NAMES,
  EQUIPMENT_SLOTS,
  economyAccountRepo,
  createEconomyAccountService,
  getEquipableItemDefinition,
} from "@/modules/economy";
import type { EquipmentSlot } from "@/modules/economy";
import { RARITY_CONFIG } from "@/modules/economy/equipment/types";
import {
  createButton,
  replyEphemeral,
  getContextInfo,
} from "@/adapters/seyfert";

/** Helper to get rarity emoji for an item based on its level. */
function getRarityEmoji(level: number | undefined): string {
  if (!level || level <= 3) return RARITY_CONFIG.common.emoji;
  if (level <= 5) return RARITY_CONFIG.uncommon.emoji;
  if (level <= 7) return RARITY_CONFIG.rare.emoji;
  return RARITY_CONFIG.holy.emoji;
}

// Pending confirmations
const pendingUnequips = new Map<
  string,
  { guildId: string; slot: EquipmentSlot }
>();

const slotOption = {
  slot: createStringOption({
    description: "Slot to unequip directly",
    required: false,
    choices: EQUIPMENT_SLOTS.map((s) => ({
      name: SLOT_DISPLAY_NAMES[s] ?? s,
      value: s,
    })),
  }),
};

@Declare({
  name: "trinkets-unequip",
  description: "🔮 Remove an equipped trinket, ring, or necklace",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 3000,
  uses: { default: 1 },
})
export default class TrinketsUnequipCommand extends Command {
  async run(ctx: GuildCommandContext<typeof slotOption>) {
    const { guildId, userId } = getContextInfo(ctx);

    if (!guildId) {
      await replyEphemeral(ctx, {
        content: "This command can only be used in a server.",
      });
      return;
    }

    const accountService = createEconomyAccountService(economyAccountRepo);
    const ensureResult = await accountService.ensureAccount(userId);
    if (ensureResult.isErr()) {
      await replyEphemeral(ctx, { content: "Could not load your account." });
      return;
    }

    const { account } = ensureResult.unwrap();
    if (account.status !== "ok") {
      await replyEphemeral(ctx, { content: "Your account has restrictions." });
      return;
    }

    const directSlot = ctx.options.slot as EquipmentSlot | undefined;

    if (directSlot) {
      // Direct unequip with confirmation
      await promptUnequip(ctx, guildId, userId, directSlot);
    } else {
      // Show slots with equipped items
      await showEquippedSlots(ctx, guildId, userId);
    }
  }
}

// Extracted helper functions

async function showEquippedSlots(
  ctx: GuildCommandContext,
  guildId: string,
  userId: string,
) {
  const loadoutResult = await equipmentService.getLoadout(guildId, userId);

  if (loadoutResult.isErr()) {
    await replyEphemeral(ctx, { content: "Could not load your equipment." });
    return;
  }

  const loadout = loadoutResult.unwrap();
  const equippedSlots = EQUIPMENT_SLOTS.filter((slot) => loadout.slots[slot]);

  if (equippedSlots.length === 0) {
    await replyEphemeral(ctx, { content: "You have no equipped items." });
    return;
  }

  const embed = new Embed()
    .setColor(EmbedColors.Orange)
    .setTitle("🔧 Select a slot to unequip")
    .setDescription("Click the button for the slot you'd like to clear.");

  // Show current equipment with rarity
  for (const slot of equippedSlots) {
    const equipped = loadout.slots[slot]!;
    const def = getEquipableItemDefinition(equipped.itemId);
    const rarityEmoji = getRarityEmoji(def?.requiredLevel);
    embed.addFields({
      name: getSlotDisplayName(slot),
      value: `${rarityEmoji} ${def?.emoji ?? "📦"} ${def?.name ?? equipped.itemId}`,
      inline: true,
    });
  }

  // Create buttons for equipped slots (max 5 per row)
  const rows: ActionRow<ReturnType<typeof createButton>>[] = [];
  let currentRow = new ActionRow<ReturnType<typeof createButton>>();

  for (let i = 0; i < equippedSlots.length; i++) {
    const slot = equippedSlots[i];
    const btn = createButton({
      customId: `trinket_unequip_slot_${userId}_${slot}`,
      label: getSlotDisplayName(slot),
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
    flags: 64, // Ephemeral
  });
}

async function promptUnequip(
  ctx: GuildCommandContext,
  guildId: string,
  userId: string,
  slot: EquipmentSlot,
) {
  const loadoutResult = await equipmentService.getLoadout(guildId, userId);

  if (loadoutResult.isErr()) {
    await replyEphemeral(ctx, { content: "Could not load your equipment." });
    return;
  }

  const loadout = loadoutResult.unwrap();
  const equipped = loadout.slots[slot];

  if (!equipped) {
    await replyEphemeral(ctx, {
      content: `Nothing is equipped in ${getSlotDisplayName(slot)}.`,
    });
    return;
  }

  const def = getEquipableItemDefinition(equipped.itemId);
  const rarityEmoji = getRarityEmoji(def?.requiredLevel);

  // Store pending
  pendingUnequips.set(userId, { guildId, slot });

  const embed = new Embed()
    .setColor(EmbedColors.Yellow)
    .setTitle("🔧 Confirm Unequip")
    .setDescription(
      `Do you want to unequip **${rarityEmoji} ${def?.emoji ?? "📦"} ${def?.name ?? equipped.itemId}** from **${getSlotDisplayName(slot)}**?\n\n` +
        "The item will return to your inventory.",
    );

  const confirmBtn = createButton({
    customId: `trinket_unequip_confirm_${userId}`,
    label: "✅ Unequip",
    style: ButtonStyle.Success,
  });

  const cancelBtn = createButton({
    customId: `trinket_unequip_cancel_${userId}`,
    label: "❌ Cancel",
    style: ButtonStyle.Secondary,
  });

  const row = new ActionRow<typeof confirmBtn>().addComponents(
    confirmBtn,
    cancelBtn,
  );

  await ctx.write({
    embeds: [embed],
    components: [row],
    flags: 64, // Ephemeral
  });
}

// Component handlers
@Declare({
  name: "trinket_unequip_slot",
  description: "Handle slot button for unequip",
})
export class UnequipSlotHandler extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const { userId, guildId } = getContextInfo(ctx);

    if (!guildId) return;

    // Parse slot from custom_id
    // @ts-ignore - custom_id access
    const customId = ctx.customId as string | undefined;
    if (!customId) return;

    const slot = customId.split("_").pop() as EquipmentSlot | undefined;
    if (!slot) return;

    await promptUnequip(ctx, guildId, userId, slot);
  }
}

@Declare({
  name: "trinket_unequip_confirm",
  description: "Confirm unequip button",
})
export class UnequipConfirmHandler extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const { userId, guildId } = getContextInfo(ctx);

    if (!guildId) return;

    const pending = pendingUnequips.get(userId);
    if (!pending || pending.guildId !== guildId) {
      await replyEphemeral(ctx, {
        content: "❌ You have no pending unequip request or it has expired.",
      });
      return;
    }

    pendingUnequips.delete(userId);

    const result = await equipmentService.unequipSlot({
      guildId,
      userId,
      slot: pending.slot,
    });

    if (result.isErr()) {
      const error = result.error;
        const messages: Record<string, string> = {
          SLOT_EMPTY: "❌ There's nothing equipped in that slot.",
          ACCOUNT_BLOCKED: "⛔ Your account has restrictions.",
          ACCOUNT_BANNED: "🚫 Your account is suspended.",
          RATE_LIMITED: "⏱️ Too many changes. Please wait a moment.",
        };

      await replyEphemeral(ctx, {
        content: messages[error.code] ?? "❌ Error unequipping the item.",
      });
      return;
    }

    const operation = result.unwrap();
    const def = getEquipableItemDefinition(operation.itemId);

      await replyEphemeral(ctx, {
        content: `✅ Unequipped ${def?.name ?? operation.itemId} from ${getSlotDisplayName(operation.slot)}. The item has returned to your inventory.`,
      });
  }
}

@Declare({
  name: "trinket_unequip_cancel",
  description: "Cancel unequip button",
})
export class UnequipCancelHandler extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const { userId } = getContextInfo(ctx);
    pendingUnequips.delete(userId);

    await replyEphemeral(ctx, { content: "❌ Unequip canceled." });
  }
}
