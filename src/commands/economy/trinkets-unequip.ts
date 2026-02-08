/**
 * Trinkets Unequip Command.
 *
 * Purpose: Remove equipped trinkets, rings, and necklaces.
 */
import {
  Command,
  Declare,
  type GuildCommandContext,
  createStringOption,
  Embed,
  ActionRow,
} from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";
import { EmbedColors } from "seyfert/lib/common";
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
import { replyEphemeral, getContextInfo } from "@/adapters/seyfert";

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
      await promptUnequip(ctx, guildId, userId, directSlot);
    } else {
      await showEquippedSlots(ctx, guildId, userId);
    }
  }
}

async function showEquippedSlots(
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
  const equippedSlots = EQUIPMENT_SLOTS.filter((slot) => loadout.slots[slot]);

  if (equippedSlots.length === 0) {
    await ctx.write({ content: "You have no equipped items.", flags: 64 });
    return;
  }

  const embed = new Embed()
    .setColor(EmbedColors.Orange)
    .setTitle("🔧 Select a slot to unequip")
    .setDescription("Choose the slot you'd like to clear.");

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

  const rows: ActionRow<Button>[] = [];
  let currentRow = new ActionRow<Button>();

  for (const slot of equippedSlots) {
    const button = new Button()
      .setLabel(getSlotDisplayName(slot))
      .setStyle(ButtonStyle.Primary)
      .onClick("trinket_unequip_slot", async (buttonCtx) => {
        await promptUnequip(buttonCtx as any, guildId, userId, slot);
      });

    currentRow.addComponents(button);
    if (currentRow.components.length === 5) {
      rows.push(currentRow);
      currentRow = new ActionRow<Button>();
    }
  }

  if (currentRow.components.length > 0) {
    rows.push(currentRow);
  }

  await ctx.write({
    embeds: [embed],
    components: rows,
    flags: 64,
  });
}

async function promptUnequip(
  ctx: WritableContext,
  guildId: string,
  userId: string,
  slot: EquipmentSlot,
) {
  const loadoutResult = await equipmentService.getLoadout(guildId, userId);

  if (loadoutResult.isErr()) {
    await ctx.write({ content: "Could not load your equipment.", flags: 64 });
    return;
  }

  const loadout = loadoutResult.unwrap();
  const equipped = loadout.slots[slot];

  if (!equipped) {
    await ctx.write({
      content: `Nothing is equipped in ${getSlotDisplayName(slot)}.`,
      flags: 64,
    });
    return;
  }

  const def = getEquipableItemDefinition(equipped.itemId);
  const rarityEmoji = getRarityEmoji(def?.requiredLevel);

  const embed = new Embed()
    .setColor(EmbedColors.Yellow)
    .setTitle("🔧 Confirm Unequip")
    .setDescription(
      `Do you want to unequip **${rarityEmoji} ${def?.emoji ?? "📦"} ${def?.name ?? equipped.itemId}** from **${getSlotDisplayName(slot)}**?\n\n` +
        "The item will return to your inventory.",
    );

  const confirmBtn = new Button()
    .setLabel("✅ Unequip")
    .setStyle(ButtonStyle.Success)
    .onClick("trinket_unequip_confirm", async (buttonCtx) => {
      const result = await equipmentService.unequipSlot({
        guildId,
        userId,
        slot,
      });

      if (result.isErr()) {
        const error = result.error;
        const messages: Record<string, string> = {
          SLOT_EMPTY: "❌ There's nothing equipped in that slot.",
          ACCOUNT_BLOCKED: "⛔ Your account has restrictions.",
          ACCOUNT_BANNED: "🚫 Your account is suspended.",
          RATE_LIMITED: "⏱️ Too many changes. Please wait a moment.",
        };

        await buttonCtx.write({
          content: messages[error.code] ?? "❌ Error unequipping the item.",
          flags: 64,
        });
        return;
      }

      const operation = result.unwrap();
      const itemDef = getEquipableItemDefinition(operation.itemId);

      await buttonCtx.write({
        content: `✅ Unequipped ${itemDef?.name ?? operation.itemId} from ${getSlotDisplayName(operation.slot)}. The item has returned to your inventory.`,
        flags: 64,
      });
    });

  const cancelBtn = new Button()
    .setLabel("❌ Cancel")
    .setStyle(ButtonStyle.Secondary)
    .onClick("trinket_unequip_cancel", async (buttonCtx) => {
      await buttonCtx.write({ content: "❌ Unequip canceled.", flags: 64 });
    });

  const backBtn = new Button()
    .setLabel("← Back")
    .setStyle(ButtonStyle.Secondary)
    .onClick("trinket_unequip_back", async (buttonCtx) => {
      await showEquippedSlots(buttonCtx as any, guildId, userId);
    });

  const row = new ActionRow<Button>().addComponents(confirmBtn, cancelBtn, backBtn);

  await ctx.write({
    embeds: [embed],
    components: [row],
    flags: 64,
  });
}
