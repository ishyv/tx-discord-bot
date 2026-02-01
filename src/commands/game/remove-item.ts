/**
 * Remove Item Command (Phase 2c).
 *
 * Purpose: Mod-only item removal.
 */

import {
  Command,
  CommandContext,
  Declare,
  Options,
  createIntegerOption,
  createStringOption,
  createUserOption,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { ITEM_DEFINITIONS } from "@/modules/inventory";
import {
  itemMutationService,
  createEconomyPermissionChecker,
  sanitizeItemId,
} from "@/modules/economy";

const itemChoices = Object.values(ITEM_DEFINITIONS).map((item) => ({
  name: item.name,
  value: item.id,
}));

const options = {
  item: createStringOption({
    description: "El item a retirar",
    required: true,
    choices: itemChoices,
  }),
  quantity: createIntegerOption({
    description: "Cantidad de items a retirar",
    required: true,
    min_value: 1,
  }),
  user: createUserOption({
    description: "El usuario a quien retirar el item",
    required: true,
  }),
  reason: createStringOption({
    description: "Razón del retiro",
    required: false,
  }),
};

@Declare({
  name: "remove-item",
  description: "Retirar un item a un usuario (mod-only)",
  defaultMemberPermissions: ["ManageGuild"],
})
@Options(options)
export default class RemoveItemCommand extends Command {
  async run(ctx: CommandContext<typeof options>) {
    const { item: rawItemId, quantity, user, reason } = ctx.options;
    const actorId = ctx.author.id;
    const guildId = ctx.guildId ?? undefined;

    // Security: Sanitize item ID
    const itemId = sanitizeItemId(rawItemId);
    if (!itemId) {
      await ctx.write({
        content: "⚠️ ID de item inválido.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const itemDef = ITEM_DEFINITIONS[itemId];
    if (!itemDef) {
      await ctx.write({
        content: "El item especificado no existe.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Create permission checker
    const perms = createEconomyPermissionChecker(ctx.member);

    // Execute item mutation (negative delta = removal)
    const result = await itemMutationService.adjustItemQuantity(
      {
        actorId,
        targetId: user.id,
        guildId,
        itemId,
        delta: -quantity,
        reason,
      },
      perms.canRemoveItems,
    );

    if (result.isErr()) {
      const error = result.error;

      const errorMessages: Record<string, string> = {
        INSUFFICIENT_PERMISSIONS:
          "❌ No tienes permisos para realizar esta acción.",
        ITEM_NOT_FOUND: "El item especificado no existe.",
        TARGET_NOT_FOUND: "El usuario objetivo no existe.",
        TARGET_BLOCKED:
          "⛔ La cuenta del usuario tiene restricciones temporales.",
        TARGET_BANNED:
          "🚫 La cuenta del usuario tiene restricciones permanentes.",
        INVALID_QUANTITY: error.message || "❌ Cantidad inválida.",
        UPDATE_FAILED: "❌ Error al actualizar el inventario.",
      };

      const message =
        errorMessages[error.code] ?? "❌ Ocurrió un error inesperado.";

      await ctx.write({
        content: message,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const adjustment = result.unwrap();
    const capacity = adjustment.capacity;

    const capacityInfo = `📦 Capacidad: ${capacity.currentSlots}/${capacity.maxSlots} slots, ${capacity.currentWeight}/${capacity.maxWeight} peso`;

    await ctx.write({
      content:
        `✅ Se han retirado **${quantity}x ${itemDef.name}** del inventario de ${user.toString()}.\n` +
        `📊 Nueva cantidad: ${adjustment.afterQuantity}\n` +
        `${capacityInfo}`,
    });
  }
}
