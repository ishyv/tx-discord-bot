/**
 * Unequip Command.
 *
 * Purpose: Show equipped slots with buttons to unequip.
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
  createButton,
  replyEphemeral,
  getContextInfo,
} from "@/adapters/seyfert";

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
  name: "unequip",
  description: "Desequipar un item de un slot",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 3000,
  uses: { default: 1 },
})
export default class UnequipCommand extends Command {
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
    await replyEphemeral(ctx, { content: "No tienes ningún item equipado." });
    return;
  }

  const embed = new Embed()
    .setColor(EmbedColors.Orange)
    .setTitle("🔧 Selecciona un Slot para Desequipar")
    .setDescription("Haz clic en el botón del slot que quieres vaciar.");

  // Show current equipment
  for (const slot of equippedSlots) {
    const equipped = loadout.slots[slot]!;
    const def = getEquipableItemDefinition(equipped.itemId);
    embed.addFields({
      name: getSlotDisplayName(slot),
      value: `${def?.emoji ?? "📦"} ${def?.name ?? equipped.itemId}`,
      inline: true,
    });
  }

  // Create buttons for equipped slots (max 5 per row)
  const rows: ActionRow<ReturnType<typeof createButton>>[] = [];
  let currentRow = new ActionRow<ReturnType<typeof createButton>>();

  for (let i = 0; i < equippedSlots.length; i++) {
    const slot = equippedSlots[i];
    const btn = createButton({
      customId: `unequip_slot_${userId}_${slot}`,
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
      content: `No tienes nada equipado en ${getSlotDisplayName(slot)}.`,
    });
    return;
  }

  const def = getEquipableItemDefinition(equipped.itemId);

  // Store pending
  pendingUnequips.set(userId, { guildId, slot });

  const embed = new Embed()
    .setColor(EmbedColors.Yellow)
    .setTitle("🔧 Confirmar Desequipamiento")
    .setDescription(
      `¿Deseas desequipar **${def?.emoji ?? "📦"} ${def?.name ?? equipped.itemId}** de **${getSlotDisplayName(slot)}**?\n\n` +
        "El item volverá a tu inventario.",
    );

  const confirmBtn = createButton({
    customId: `unequip_confirm_${userId}`,
    label: "✅ Desequipar",
    style: ButtonStyle.Success,
  });

  const cancelBtn = createButton({
    customId: `unequip_cancel_${userId}`,
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

// Component handlers
@Declare({
  name: "unequip_slot",
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
  name: "unequip_confirm",
  description: "Confirm unequip button",
})
export class UnequipConfirmHandler extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const { userId, guildId } = getContextInfo(ctx);

    if (!guildId) return;

    const pending = pendingUnequips.get(userId);
    if (!pending || pending.guildId !== guildId) {
      await replyEphemeral(ctx, {
        content: "❌ No tienes un desequipamiento pendiente o ha expirado.",
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
        SLOT_EMPTY: "❌ No hay nada equipado en este slot.",
        ACCOUNT_BLOCKED: "⛔ Tu cuenta tiene restricciones.",
        ACCOUNT_BANNED: "🚫 Tu cuenta está suspendida.",
        RATE_LIMITED: "⏱️ Demasiados cambios. Espera un momento.",
      };

      await replyEphemeral(ctx, {
        content: messages[error.code] ?? "❌ Error al desequipar el item.",
      });
      return;
    }

    const operation = result.unwrap();
    const def = getEquipableItemDefinition(operation.itemId);

    await replyEphemeral(ctx, {
      content: `✅ Desequipado ${def?.name ?? operation.itemId} de ${getSlotDisplayName(operation.slot)}. El item volvió a tu inventario.`,
    });
  }
}

@Declare({
  name: "unequip_cancel",
  description: "Cancel unequip button",
})
export class UnequipCancelHandler extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const { userId } = getContextInfo(ctx);
    pendingUnequips.delete(userId);

    await replyEphemeral(ctx, { content: "❌ Desequipamiento cancelado." });
  }
}
