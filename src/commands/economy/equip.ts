/**
 * Equip Command.
 *
 * Purpose: Show equipable items and let users equip them.
 * Opens with select menu filtered by slot.
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
import { UIColors } from "@/modules/ui/design-system";
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
import {
  createSelectMenu,
  createButton,
  replyEphemeral,
  getContextInfo,
  getSelectValue,
} from "@/adapters/seyfert";

// Pending confirmations
const pendingEquips = new Map<string, { guildId: string; itemId: string }>();

const slotOption = {
  slot: createStringOption({
    description: "Slot to equip an item to",
    required: false,
    choices: EQUIPMENT_SLOTS.map((s) => ({
      name: SLOT_DISPLAY_NAMES[s] ?? s,
      value: s,
    })),
  }),
};

@Declare({
  name: "equip",
  description: "🎒 Equip an economy item (perks/badges). For RPG equipment use /rpg equip",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 3000,
  uses: { default: 1 },
})
export default class EquipCommand extends Command {
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

    const selectedSlot = ctx.options.slot as EquipmentSlot | undefined;

    if (selectedSlot) {
      await showSlotItems(ctx, guildId, userId, selectedSlot);
    } else {
      await showSlotSelection(ctx, guildId, userId);
    }
  }
}

// Extracted helper functions (not methods, to avoid private access issues)

async function showSlotSelection(
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

  const embed = new Embed()
    .setColor(UIColors.info)
    .setTitle("👤 Equipment Loadout")
    .setDescription("Select a slot to equip an item.");

  // Show current equipment
  for (const slot of EQUIPMENT_SLOTS) {
    const equipped = loadout.slots[slot];
    const slotName = getSlotDisplayName(slot);
    if (equipped) {
      const def = getEquipableItemDefinition(equipped.itemId);
      embed.addFields({
        name: slotName,
        value: `${def?.emoji ?? "📦"} ${def?.name ?? equipped.itemId}`,
        inline: true,
      });
    } else {
      embed.addFields({
        name: slotName,
        value: "*Empty*",
        inline: true,
      });
    }
  }

  const selectOptions = EQUIPMENT_SLOTS.map((slot) => ({
    label: SLOT_DISPLAY_NAMES[slot] ?? slot,
    value: slot,
    description: loadout.slots[slot]
      ? `Swap: ${getEquipableItemDefinition(loadout.slots[slot]!.itemId)?.name ?? "Equipped"}`
      : "Empty slot - Equip item",
  }));

  const selectMenu = createSelectMenu({
    customId: `equip_slot_select_${userId}`,
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
  guildId: string,
  userId: string,
  slot: EquipmentSlot,
) {
  const itemsResult = await equipmentService.listEquipableItemsForSlot(
    guildId,
    userId,
    slot,
  );
  const loadoutResult = await equipmentService.getLoadout(guildId, userId);

  if (itemsResult.isErr() || loadoutResult.isErr()) {
    await replyEphemeral(ctx, { content: "Could not load your inventory." });
    return;
  }

  const items = itemsResult.unwrap();
  const loadout = loadoutResult.unwrap();
  const currentlyEquipped = loadout.slots[slot];

  if (items.length === 0) {
    await replyEphemeral(ctx, {
      content: `No equipable items for **${getSlotDisplayName(slot)}** in your inventory.`,
    });
    return;
  }

  const embed = new Embed()
    .setColor(UIColors.amethyst)
    .setTitle(`${getSlotDisplayName(slot)} — Available Items`)
    .setDescription(
      currentlyEquipped
        ? `Currently equipped: ${getEquipableItemDefinition(currentlyEquipped.itemId)?.emoji ?? "📦"} ${getEquipableItemDefinition(currentlyEquipped.itemId)?.name ?? currentlyEquipped.itemId}`
        : "*Empty slot*",
    );

  for (const item of items.slice(0, 10)) {
    const statsText = Object.entries(item.stats)
      .filter(([, v]) => v !== undefined && v !== 0)
      .map(([k, v]) => {
        const valueText =
          typeof v === "number" && v < 1 && v > 0
            ? `+${(v * 100).toFixed(0)}%`
            : `+${v}`;
        switch (k) {
          case "luck":
            return `${valueText} luck`;
          case "workBonusPct":
            return `${valueText} work`;
          case "shopDiscountPct":
            return `${valueText} discount`;
          case "weightCap":
            return `${valueText} weight`;
          case "slotCap":
            return `${valueText} slots`;
          case "dailyBonusCap":
            return `${valueText} streak`;
          default:
            return "";
        }
      })
      .join(", ");

    const levelReq = item.requiredLevel ? ` (Lv.${item.requiredLevel}+)` : "";

    embed.addFields({
      name: `${item.emoji} ${item.name}${levelReq}`,
      value: `${item.description}\n📊 ${statsText}\n📦 Qty: \`${item.quantity}\``,
      inline: false,
    });
  }

  const selectOptions = items.slice(0, 25).map((item) => ({
    label: `${item.name} (×${item.quantity})`,
    value: item.itemId,
    description: item.requiredLevel
      ? `Requires Lv.${item.requiredLevel}`
      : "Available",
  }));

  const selectMenu = createSelectMenu({
    customId: `equip_item_select_${userId}_${slot}`,
    placeholder: "Select an item to equip...",
    options: selectOptions,
  });

  const row = new ActionRow<typeof selectMenu>().addComponents(selectMenu);

  const backBtn = createButton({
    customId: `equip_back_${userId}`,
    label: "← Back",
    style: ButtonStyle.Secondary,
  });

  const row2 = new ActionRow<typeof backBtn>().addComponents(backBtn);

  await ctx.write({
    embeds: [embed],
    components: [row, row2],
    flags: 64, // Ephemeral
  });
}

// Component handlers
@Declare({
  name: "equip_slot_select",
  description: "Handle slot selection for equip",
})
export class EquipSlotSelectHandler extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const { userId, guildId } = getContextInfo(ctx);

    if (!guildId) return;

    const slot = getSelectValue(ctx) as EquipmentSlot | undefined;
    if (!slot) return;

    await showSlotItems(ctx, guildId, userId, slot);
  }
}

@Declare({
  name: "equip_item_select",
  description: "Handle item selection for equip",
})
export class EquipItemSelectHandler extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const { userId, guildId } = getContextInfo(ctx);

    if (!guildId) return;

    const itemId = getSelectValue(ctx);
    if (!itemId) {
      await replyEphemeral(ctx, { content: "Item not found." });
      return;
    }

    const itemDef = getEquipableItemDefinition(itemId);
    if (!itemDef) {
      await replyEphemeral(ctx, { content: "Item not found." });
      return;
    }

    // Show confirmation
    pendingEquips.set(userId, { guildId, itemId });

    const statsText = Object.entries(itemDef.stats)
      .filter(([, v]) => v !== undefined && v !== 0)
      .map(([k, v]) => {
        const valueText =
          typeof v === "number" && v < 1 && v > 0
            ? `+${(v * 100).toFixed(0)}%`
            : `+${v}`;
        switch (k) {
          case "luck":
            return `${valueText} luck`;
          case "workBonusPct":
            return `${valueText} work`;
          case "shopDiscountPct":
            return `${valueText} discount`;
          case "weightCap":
            return `${valueText} weight`;
          case "slotCap":
            return `${valueText} slots`;
          case "dailyBonusCap":
            return `${valueText} streak`;
          default:
            return "";
        }
      })
      .join(", ");

    const embed = new Embed()
      .setColor(UIColors.warning)
      .setTitle("🔰 Confirm Equipment")
      .setDescription(
        `Equip **${itemDef.emoji ?? "📦"} ${itemDef.name}**?\n\n` +
        `${itemDef.description}\n\n` +
        `📊 Stats: ${statsText}\n` +
        `👤 Slot: ${getSlotDisplayName(itemDef.slot)}`,
      );

    const confirmBtn = createButton({
      customId: `equip_confirm_${userId}`,
      label: "✓ Equip",
      style: ButtonStyle.Success,
    });

    const cancelBtn = createButton({
      customId: `equip_cancel_${userId}`,
      label: "✕ Cancel",
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
}

@Declare({
  name: "equip_confirm",
  description: "Confirm equip button",
})
export class EquipConfirmHandler extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const { userId, guildId } = getContextInfo(ctx);

    if (!guildId) return;

    const pending = pendingEquips.get(userId);
    if (!pending || pending.guildId !== guildId) {
      await replyEphemeral(ctx, {
        content: "❌ No pending equipment action or it has expired.",
      });
      return;
    }

    pendingEquips.delete(userId);

    const result = await equipmentService.equipItem({
      guildId,
      userId,
      itemId: pending.itemId,
    });

    if (result.isErr()) {
      const error = result.error;
      const messages: Record<string, string> = {
        ITEM_NOT_EQUIPABLE: "❌ This item cannot be equipped.",
        ITEM_NOT_IN_INVENTORY: "❌ You don't have this item in your inventory.",
        LEVEL_REQUIRED: "❌ You don't meet the level requirement for this item.",
        ACCOUNT_BLOCKED: "⛔ Your account has restrictions.",
        ACCOUNT_BANNED: "🚫 Your account is suspended.",
        RATE_LIMITED: "⏱️ Too many changes. Please wait a moment.",
      };

      await replyEphemeral(ctx, {
        content: messages[error.code] ?? "❌ Failed to equip item.",
      });
      return;
    }

    const operation = result.unwrap();
    const itemDef = getEquipableItemDefinition(operation.itemId);

    const operationText =
      operation.operation === "swap"
        ? `Swapped ${getEquipableItemDefinition(operation.previousItemId!)?.name ?? "previous"} for ${itemDef?.name ?? operation.itemId}`
        : `Equipped ${itemDef?.name ?? operation.itemId}`;

    await replyEphemeral(ctx, {
      content: `✅ ${operationText} in ${getSlotDisplayName(operation.slot)}.`,
    });
  }
}

@Declare({
  name: "equip_cancel",
  description: "Cancel equip button",
})
export class EquipCancelHandler extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const { userId } = getContextInfo(ctx);
    pendingEquips.delete(userId);

    await replyEphemeral(ctx, { content: "❌ Equipment action cancelled." });
  }
}

@Declare({
  name: "equip_back",
  description: "Back to slot selection button",
})
export class EquipBackHandler extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const { userId, guildId } = getContextInfo(ctx);

    if (!guildId) return;

    await showSlotSelection(ctx, guildId, userId);
  }
}
