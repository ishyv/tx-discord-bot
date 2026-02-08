/**
 * Trinkets Command.
 *
 * Purpose: Manage magical trinkets, rings, and necklaces that provide boons.
 * These are NOT combat equipment - use /rpg equipment for weapons and armor.
 */
import {
  Command,
  Declare,
  createStringOption,
  type GuildCommandContext,
  Embed,
  ActionRow,
  StringSelectMenu,
  StringSelectOption,
} from "seyfert";
import { ButtonStyle, MessageFlags } from "seyfert/lib/types";
import { UIColors } from "@/modules/ui/design-system";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { Button } from "@/modules/ui";
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

type WritableContext = {
  write: (message: any) => Promise<any>;
};

/** Helper to get rarity emoji for an item based on its level. */
function getRarityEmoji(level: number | undefined): string {
  if (!level || level <= 3) return RARITY_CONFIG.common.emoji;
  if (level <= 5) return RARITY_CONFIG.uncommon.emoji;
  if (level <= 7) return RARITY_CONFIG.rare.emoji;
  return RARITY_CONFIG.holy.emoji;
}

/** Helper to get rarity color for embeds. */
function getRarityColor(level: number | undefined): number {
  if (!level || level <= 3) return RARITY_CONFIG.common.color;
  if (level <= 5) return RARITY_CONFIG.uncommon.color;
  if (level <= 7) return RARITY_CONFIG.rare.color;
  return RARITY_CONFIG.holy.color;
}

/** Helper to get rarity name. */
function getRarityName(level: number | undefined): string {
  if (!level || level <= 3) return RARITY_CONFIG.common.name;
  if (level <= 5) return RARITY_CONFIG.uncommon.name;
  if (level <= 7) return RARITY_CONFIG.rare.name;
  return RARITY_CONFIG.holy.name;
}

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
  name: "trinkets",
  description: "🔮 Manage your magical trinkets, rings, and necklaces (boons)",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 3000,
  uses: { default: 1 },
})
export default class TrinketsCommand extends Command {
  async run(ctx: GuildCommandContext<typeof slotOption>) {
    const { guildId } = ctx;
    const userId = ctx.author.id;

    if (!guildId) {
      await ctx.editOrReply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const accountService = createEconomyAccountService(economyAccountRepo);
    const ensureResult = await accountService.ensureAccount(userId);
    if (ensureResult.isErr()) {
      await ctx.editOrReply({ content: "Could not load your account.", flags: MessageFlags.Ephemeral });
      return;
    }

    const { account } = ensureResult.unwrap();
    if (account.status !== "ok") {
      await ctx.editOrReply({ content: "Your account has restrictions.", flags: MessageFlags.Ephemeral });
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

async function showSlotSelection(
  ctx: WritableContext,
  guildId: string,
  userId: string,
) {
  const loadoutResult = await equipmentService.getLoadout(guildId, userId);
  if (loadoutResult.isErr()) {
    await ctx.write({ content: "Could not load your equipment.", flags: 64 });
    return;
  }

  const loadout = loadoutResult.unwrap();

  const embed = new Embed()
    .setColor(UIColors.info)
    .setTitle("👤 Equipment Loadout")
    .setDescription("Select a slot to equip an item.");

  for (const slot of EQUIPMENT_SLOTS) {
    const equipped = loadout.slots[slot];
    const slotName = getSlotDisplayName(slot);
    if (equipped) {
      const def = getEquipableItemDefinition(equipped.itemId);
      const rarityEmoji = getRarityEmoji(def?.requiredLevel);
      embed.addFields({
        name: slotName,
        value: `${rarityEmoji} ${def?.emoji ?? "📦"} ${def?.name ?? equipped.itemId}`,
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

  const selectMenu = new StringSelectMenu()
    .setPlaceholder("Select a slot...")
    .setValuesLength({ min: 1, max: 1 })
    .setOptions(
      EQUIPMENT_SLOTS.map((slot) =>
        new StringSelectOption()
          .setLabel(SLOT_DISPLAY_NAMES[slot] ?? slot)
          .setValue(slot)
          .setDescription(
            loadout.slots[slot]
              ? `Swap: ${getEquipableItemDefinition(loadout.slots[slot]!.itemId)?.name ?? "Equipped"}`
              : "Empty slot - Equip item",
          ),
      ),
    )
    .onSelect("trinkets_slot_select", async (menuCtx) => {
      const slot = menuCtx.interaction.values?.[0] as EquipmentSlot | undefined;
      if (!slot) return;
      await showSlotItems(menuCtx as any, guildId, userId, slot);
    });

  const row = new ActionRow<typeof selectMenu>().addComponents(selectMenu);

  await ctx.write({
    embeds: [embed],
    components: [row],
    flags: 64,
  });
}

async function showSlotItems(
  ctx: WritableContext,
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
    await ctx.write({ content: "Could not load your inventory.", flags: 64 });
    return;
  }

  const items = itemsResult.unwrap();
  const loadout = loadoutResult.unwrap();
  const currentlyEquipped = loadout.slots[slot];

  if (items.length === 0) {
    await ctx.write({
      content: `No equipable items for **${getSlotDisplayName(slot)}** in your inventory.`,
      flags: 64,
    });
    return;
  }

  const equippedDef = currentlyEquipped
    ? getEquipableItemDefinition(currentlyEquipped.itemId)
    : null;
  const equippedRarityEmoji = equippedDef
    ? getRarityEmoji(equippedDef.requiredLevel)
    : "";

  const embed = new Embed()
    .setColor(UIColors.amethyst)
    .setTitle(`${getSlotDisplayName(slot)} — Available Items`)
    .setDescription(
      currentlyEquipped
        ? `Currently equipped: ${equippedRarityEmoji} ${equippedDef?.emoji ?? "📦"} **${equippedDef?.name ?? currentlyEquipped.itemId}**`
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
      .filter(Boolean)
      .join(", ");

    const rarityEmoji = getRarityEmoji(item.requiredLevel);
    const rarityName = getRarityName(item.requiredLevel);
    const levelReq = item.requiredLevel ? `Lv.${item.requiredLevel}+` : "Lv.1+";

    embed.addFields({
      name: `${rarityEmoji} ${item.emoji} ${item.name}`,
      value: `*${rarityName}* · ${levelReq}\n${item.description}\n📊 ${statsText}\n📦 Qty: \`${item.quantity}\``,
      inline: false,
    });
  }

  const selectMenu = new StringSelectMenu()
    .setPlaceholder("Select an item to equip...")
    .setValuesLength({ min: 1, max: 1 })
    .setOptions(
      items.slice(0, 25).map((item) =>
        new StringSelectOption()
          .setLabel(`${item.name} (×${item.quantity})`)
          .setValue(item.itemId)
          .setDescription(
            item.requiredLevel ? `Requires Lv.${item.requiredLevel}` : "Available",
          ),
      ),
    )
    .onSelect("trinkets_item_select", async (menuCtx) => {
      const itemId = menuCtx.interaction.values?.[0];
      if (!itemId) return;
      await showEquipConfirmation(menuCtx as any, guildId, userId, slot, itemId);
    });

  const backBtn = new Button()
    .setLabel("← Back")
    .setStyle(ButtonStyle.Secondary)
    .onClick("trinkets_back", async (buttonCtx) => {
      await showSlotSelection(buttonCtx as any, guildId, userId);
    });

  const row = new ActionRow<typeof selectMenu>().addComponents(selectMenu);
  const row2 = new ActionRow<typeof backBtn>().addComponents(backBtn);

  await ctx.write({
    embeds: [embed],
    components: [row, row2],
    flags: 64,
  });
}

async function showEquipConfirmation(
  ctx: WritableContext,
  guildId: string,
  userId: string,
  slot: EquipmentSlot,
  itemId: string,
) {
  const itemDef = getEquipableItemDefinition(itemId);
  if (!itemDef) {
    await ctx.write({ content: "Item not found.", flags: 64 });
    return;
  }

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
    .filter(Boolean)
    .join(", ");

  const rarityEmoji = getRarityEmoji(itemDef.requiredLevel);
  const rarityName = getRarityName(itemDef.requiredLevel);
  const rarityColor = getRarityColor(itemDef.requiredLevel);
  const levelReq = itemDef.requiredLevel ? `Lv.${itemDef.requiredLevel}+` : "Lv.1+";

  const embed = new Embed()
    .setColor(rarityColor)
    .setTitle(`${rarityEmoji} Confirm Equipment`)
    .setDescription(
      `Equip **${itemDef.emoji ?? "📦"} ${itemDef.name}**?\n\n` +
        `*${rarityName}* · ${levelReq}\n` +
        `${itemDef.description}\n\n` +
        `📊 Stats: ${statsText || "No stat bonuses"}\n` +
        `👤 Slot: ${getSlotDisplayName(itemDef.slot)}`,
    );

  const confirmBtn = new Button()
    .setLabel("✓ Equip")
    .setStyle(ButtonStyle.Success)
    .onClick("trinkets_confirm", async (buttonCtx) => {
      const result = await equipmentService.equipItem({
        guildId,
        userId,
        itemId,
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

        await buttonCtx.write({
          content: messages[error.code] ?? "❌ Failed to equip item.",
          flags: 64,
        });
        return;
      }

      const operation = result.unwrap();
      const operationItemDef = getEquipableItemDefinition(operation.itemId);
      const operationText =
        operation.operation === "swap"
          ? `Swapped ${getEquipableItemDefinition(operation.previousItemId!)?.name ?? "previous"} for ${operationItemDef?.name ?? operation.itemId}`
          : `Equipped ${operationItemDef?.name ?? operation.itemId}`;

      await buttonCtx.write({
        content: `✅ ${operationText} in ${getSlotDisplayName(operation.slot)}.`,
        flags: 64,
      });
    });

  const cancelBtn = new Button()
    .setLabel("✕ Cancel")
    .setStyle(ButtonStyle.Secondary)
    .onClick("trinkets_cancel", async (buttonCtx) => {
      await buttonCtx.write({
        content: "❌ Equipment action cancelled.",
        flags: 64,
      });
    });

  const backBtn = new Button()
    .setLabel("← Back")
    .setStyle(ButtonStyle.Secondary)
    .onClick("trinkets_confirm_back", async (buttonCtx) => {
      await showSlotItems(buttonCtx as any, guildId, userId, slot);
    });

  const row = new ActionRow<typeof confirmBtn>().addComponents(
    confirmBtn,
    cancelBtn,
    backBtn,
  );

  await ctx.write({
    embeds: [embed],
    components: [row],
    flags: 64,
  });
}

