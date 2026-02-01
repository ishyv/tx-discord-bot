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
    description: "Item to give",
    required: true,
    choices: itemChoices,
  }),
  quantity: createIntegerOption({
    description: "Number of items",
    required: true,
    min_value: 1,
  }),
  user: createUserOption({
    description: "User to give the item to",
    required: true,
  }),
  reason: createStringOption({
    description: "Reason for the adjustment",
    required: false,
  }),
  force: createBooleanOption({
    description: "Force delivery ignoring capacity limits",
    required: false,
  }),
};

@Declare({
  name: "give-item",
  description: "Give an item to a user (mod-only)",
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
        INSUFFICIENT_PERMISSIONS:
          "❌ You don't have permission to perform this action.",
        ITEM_NOT_FOUND: "The specified item does not exist.",
        TARGET_NOT_FOUND: "The target user does not exist.",
        TARGET_BLOCKED:
          "⛔ The user's account has temporary restrictions.",
        TARGET_BANNED:
          "🚫 The user's account has permanent restrictions.",
        INVALID_QUANTITY: "❌ Invalid quantity.",
        CAPACITY_EXCEEDED: `❌ Capacity limit exceeded. Use \`force: true\` to force.`,
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

    // Build response with capacity info
    let capacityWarning = "";
    if (capacity.weightExceeded || capacity.slotsExceeded) {
      capacityWarning = "\n⚠️ **Warning:** Capacity limits exceeded.";
    }

    const capacityInfo = `📦 Capacity: ${capacity.currentSlots}/${capacity.maxSlots} slots, ${capacity.currentWeight}/${capacity.maxWeight} weight`;

    await ctx.write({
      content:
        `✅ Added **${quantity}x ${itemDef.name}** to ${user.toString()}'s inventory.\n` +
        `📊 New quantity: ${adjustment.afterQuantity}\n` +
        `${capacityInfo}${capacityWarning}`,
    });
  }
}
