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
  description: "Equip an item from your inventory",
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
    .setColor(EmbedColors.Blue)
    .setTitle("👤 Selecciona un Slot")
    .setDescription("Elige el slot donde quieres equipar un item.");

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
        value: "*Vacío*",
        inline: true,
      });
    }
  }

  const selectOptions = EQUIPMENT_SLOTS.map((slot) => ({
    label: SLOT_DISPLAY_NAMES[slot] ?? slot,
    value: slot,
    description: loadout.slots[slot]
      ? `Cambiar: ${getEquipableItemDefinition(loadout.slots[slot]!.itemId)?.name ?? "Equipado"}`
      : "Slot vacío - Equipar item",
  }));

  const selectMenu = createSelectMenu({
    customId: `equip_slot_select_${userId}`,
    placeholder: "Selecciona un slot...",
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
      content: `No tienes items equipables para ${getSlotDisplayName(slot)} en tu inventario.`,
    });
    return;
  }

  const embed = new Embed()
    .setColor(EmbedColors.Purple)
    .setTitle(`${getSlotDisplayName(slot)} - Items Disponibles`)
    .setDescription(
      currentlyEquipped
        ? `Actualmente equipado: ${getEquipableItemDefinition(currentlyEquipped.itemId)?.emoji ?? "📦"} ${getEquipableItemDefinition(currentlyEquipped.itemId)?.name ?? currentlyEquipped.itemId}`
        : "Slot vacío",
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
            return `${valueText} suerte`;
          case "workBonusPct":
            return `${valueText} trabajo`;
          case "shopDiscountPct":
            return `${valueText} descuento`;
          case "weightCap":
            return `${valueText} peso`;
          case "slotCap":
            return `${valueText} slots`;
          case "dailyBonusCap":
            return `${valueText} racha`;
          default:
            return "";
        }
      })
      .join(", ");

    const levelReq = item.requiredLevel ? ` (Nv ${item.requiredLevel}+)` : "";

    embed.addFields({
      name: `${item.emoji} ${item.name}${levelReq}`,
      value: `${item.description}\n📊 ${statsText}\n📦 Cantidad: ${item.quantity}`,
      inline: false,
    });
  }

  const selectOptions = items.slice(0, 25).map((item) => ({
    label: `${item.name} (x${item.quantity})`,
    value: item.itemId,
    description: item.requiredLevel
      ? `Requiere Nv ${item.requiredLevel}`
      : "Disponible",
  }));

  const selectMenu = createSelectMenu({
    customId: `equip_item_select_${userId}_${slot}`,
    placeholder: "Selecciona un item para equipar...",
    options: selectOptions,
  });

  const row = new ActionRow<typeof selectMenu>().addComponents(selectMenu);

  const backBtn = createButton({
    customId: `equip_back_${userId}`,
    label: "⬅️ Volver",
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
      await replyEphemeral(ctx, { content: "Item no encontrado." });
      return;
    }

    const itemDef = getEquipableItemDefinition(itemId);
    if (!itemDef) {
      await replyEphemeral(ctx, { content: "Item no encontrado." });
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
            return `${valueText} suerte`;
          case "workBonusPct":
            return `${valueText} trabajo`;
          case "shopDiscountPct":
            return `${valueText} descuento`;
          case "weightCap":
            return `${valueText} peso`;
          case "slotCap":
            return `${valueText} slots`;
          case "dailyBonusCap":
            return `${valueText} racha`;
          default:
            return "";
        }
      })
      .join(", ");

    const embed = new Embed()
      .setColor(EmbedColors.Yellow)
      .setTitle("🛒 Confirmar Equipamiento")
      .setDescription(
        `¿Equipar **${itemDef.emoji ?? "📦"} ${itemDef.name}**?\n\n` +
          `${itemDef.description}\n\n` +
          `📊 Stats: ${statsText}\n` +
          `👤 Slot: ${getSlotDisplayName(itemDef.slot)}`,
      );

    const confirmBtn = createButton({
      customId: `equip_confirm_${userId}`,
      label: "✅ Equipar",
      style: ButtonStyle.Success,
    });

    const cancelBtn = createButton({
      customId: `equip_cancel_${userId}`,
      label: "❌ Cancelar",
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
        content: "❌ No tienes un equipamiento pendiente o ha expirado.",
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
        ITEM_NOT_EQUIPABLE: "❌ Este item no se puede equipar.",
        ITEM_NOT_IN_INVENTORY: "❌ No tienes este item en tu inventario.",
        LEVEL_REQUIRED: "❌ No tienes el nivel requerido para este item.",
        ACCOUNT_BLOCKED: "⛔ Tu cuenta tiene restricciones.",
        ACCOUNT_BANNED: "🚫 Tu cuenta está suspendida.",
        RATE_LIMITED: "⏱️ Demasiados cambios. Espera un momento.",
      };

      await replyEphemeral(ctx, {
        content: messages[error.code] ?? "❌ Error al equipar el item.",
      });
      return;
    }

    const operation = result.unwrap();
    const itemDef = getEquipableItemDefinition(operation.itemId);

    const operationText =
      operation.operation === "swap"
        ? `Cambiado ${getEquipableItemDefinition(operation.previousItemId!)?.name ?? "anterior"} por ${itemDef?.name ?? operation.itemId}`
        : `Equipado ${itemDef?.name ?? operation.itemId}`;

    await replyEphemeral(ctx, {
      content: `✅ ${operationText} en ${getSlotDisplayName(operation.slot)}.`,
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

    await replyEphemeral(ctx, { content: "❌ Equipamiento cancelado." });
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
