/**
 * Give Item Command (Phase 2c).
 *
 * Purpose: Mod-only item granting with capacity constraints.
 */

import {
  Command,
  CommandContext,
  Declare,
  Options,
  createIntegerOption,
  createStringOption,
  createUserOption,
  createBooleanOption,
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
    description: "El item a dar",
    required: true,
    choices: itemChoices,
  }),
  quantity: createIntegerOption({
    description: "Cantidad de items",
    required: true,
    min_value: 1,
  }),
  user: createUserOption({
    description: "El usuario a quien dar el item",
    required: true,
  }),
  reason: createStringOption({
    description: "Razón del ajuste",
    required: false,
  }),
  force: createBooleanOption({
    description: "Forzar entrega ignorando límites de capacidad",
    required: false,
  }),
};

@Declare({
  name: "give-item",
  description: "Dar un item a un usuario (mod-only)",
  defaultMemberPermissions: ["ManageGuild"],
})
@Options(options)
export default class GiveItemCommand extends Command {
  async run(ctx: CommandContext<typeof options>) {
    const { item: rawItemId, quantity, user, reason, force } = ctx.options;
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

    // Execute item mutation
    const result = await itemMutationService.adjustItemQuantity(
      {
        actorId,
        targetId: user.id,
        guildId,
        itemId,
        delta: quantity,
        reason,
        force: force ?? false,
      },
      perms.canGrantItems,
    );

    if (result.isErr()) {
      const error = result.error;

      const errorMessages: Record<string, string> = {
        INSUFFICIENT_PERMISSIONS: "❌ No tienes permisos para realizar esta acción.",
        ITEM_NOT_FOUND: "El item especificado no existe.",
        TARGET_NOT_FOUND: "El usuario objetivo no existe.",
        TARGET_BLOCKED: "⛔ La cuenta del usuario tiene restricciones temporales.",
        TARGET_BANNED: "🚫 La cuenta del usuario tiene restricciones permanentes.",
        INVALID_QUANTITY: "❌ Cantidad inválida.",
        CAPACITY_EXCEEDED: `❌ Límite de capacidad excedido. Usa \`force: true\` para forzar.`,
        UPDATE_FAILED: "❌ Error al actualizar el inventario.",
      };

      const message = errorMessages[error.code] ?? "❌ Ocurrió un error inesperado.";

      await ctx.write({
        content: message,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const adjustment = result.unwrap();
    const capacity = adjustment.capacity;

    // Build response with capacity info
    let capacityWarning = "";
    if (capacity.weightExceeded || capacity.slotsExceeded) {
      capacityWarning = "\n⚠️ **Advertencia:** Límites de capacidad excedidos.";
    }

    const capacityInfo = `📦 Capacidad: ${capacity.currentSlots}/${capacity.maxSlots} slots, ${capacity.currentWeight}/${capacity.maxWeight} peso`;

    await ctx.write({
      content:
        `✅ Se han añadido **${quantity}x ${itemDef.name}** al inventario de ${user.toString()}.\n` +
        `📊 Nueva cantidad: ${adjustment.afterQuantity}\n` +
        `${capacityInfo}${capacityWarning}`,
    });
  }
}
