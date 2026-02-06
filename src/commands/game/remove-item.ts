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

const options = {
  item: createStringOption({
    description: "Item ID (e.g., iron_ore, copper_ingot)",
    required: true,
  }),
  quantity: createIntegerOption({
    description: "Number of items to remove",
    required: true,
    min_value: 1,
  }),
  user: createUserOption({
    description: "User to remove the item from",
    required: true,
  }),
  reason: createStringOption({
    description: "Reason for removal",
    required: false,
  }),
};

@Declare({
  name: "remove-item",
  description: "Remove an item from a user (mod-only)",
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
        content: "⚠️ Invalid item ID.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const itemDef = ITEM_DEFINITIONS[itemId];
    if (!itemDef) {
      await ctx.write({
        content: "The specified item does not exist.",
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
          "❌ You don't have permission to perform this action.",
        ITEM_NOT_FOUND: "The specified item does not exist.",
        TARGET_NOT_FOUND: "The target user does not exist.",
        TARGET_BLOCKED:
          "⛔ The user's account has temporary restrictions.",
        TARGET_BANNED:
          "🚫 The user's account has permanent restrictions.",
        INVALID_QUANTITY: error.message || "❌ Invalid quantity.",
        UPDATE_FAILED: "❌ Error updating inventory.",
      };

      const message =
        errorMessages[error.code] ?? "❌ An unexpected error occurred.";

      await ctx.write({
        content: message,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const adjustment = result.unwrap();
    const capacity = adjustment.capacity;

    const capacityInfo = `📦 Capacity: ${capacity.currentSlots}/${capacity.maxSlots} slots, ${capacity.currentWeight}/${capacity.maxWeight} weight`;

    await ctx.write({
      content:
        `✅ Removed **${quantity}x ${itemDef.name}** from ${user.toString()}'s inventory.\n` +
        `📊 New quantity: ${adjustment.afterQuantity}\n` +
        `${capacityInfo}`,
    });
  }
}
