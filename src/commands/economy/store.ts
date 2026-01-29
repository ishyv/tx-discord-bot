/**
 * Store Command (Phase 2e).
 *
 * Purpose: Buy and sell items at the guild store.
 * Commands: /store buy, /store sell, /store list
 */

import {
  Command,
  CommandContext,
  Declare,
  Options,
  createIntegerOption,
  createStringOption,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { ITEM_DEFINITIONS } from "@/modules/inventory";
import { storeService } from "@/modules/economy";
import { currencyRegistry } from "@/modules/economy/transactions";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import type { StoreError } from "@/modules/economy/store";

// Options for buy subcommand
const buyOptions = {
  item: createStringOption({
    description: "Item to buy",
    required: true,
    choices: Object.values(ITEM_DEFINITIONS).map((item) => ({
      name: item.name,
      value: item.id,
    })),
  }),
  quantity: createIntegerOption({
    description: "Quantity to buy (default: 1)",
    required: false,
    min_value: 1,
  }),
};

// Options for sell subcommand
const sellOptions = {
  item: createStringOption({
    description: "Item to sell",
    required: true,
    choices: Object.values(ITEM_DEFINITIONS).map((item) => ({
      name: item.name,
      value: item.id,
    })),
  }),
  quantity: createIntegerOption({
    description: "Quantity to sell (default: 1)",
    required: false,
    min_value: 1,
  }),
};

@Declare({
  name: "store",
  description: "Guild store - buy and sell items",
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 3000,
  uses: { default: 1 },
})
export default class StoreCommand extends Command {
  async run(ctx: CommandContext) {
    // Default action: list store items
    await listItems(ctx);
  }
}

@Declare({
  name: "store-buy",
  description: "Buy an item from the store",
})
@Options(buyOptions)
export class StoreBuyCommand extends Command {
  async run(ctx: CommandContext<typeof buyOptions>) {
    const guildId = ctx.guildId;

    if (!guildId) {
      await ctx.write({
        content: "❌ This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { item: itemId, quantity = 1 } = ctx.options;
    const buyerId = ctx.author.id;

    // Get item definition for display
    const itemDef = ITEM_DEFINITIONS[itemId];
    if (!itemDef) {
      await ctx.write({
        content: "❌ Item not found.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Show processing message
    await ctx.write({
      content: `🛒 Processing purchase of ${quantity}x ${itemDef.name}...`,
      flags: MessageFlags.Ephemeral,
    });

    // Execute purchase
    const result = await storeService.buyItem({
      buyerId,
      guildId,
      itemId,
      quantity,
    });

    if (result.isErr()) {
      const error = result.error as StoreError;

      const errorMessages: Record<string, string> = {
        STORE_CLOSED: "❌ The store is currently closed.",
        ITEM_NOT_FOUND: "❌ Item not found in the store.",
        ITEM_NOT_AVAILABLE: "❌ This item is not available for purchase.",
        INSUFFICIENT_STOCK: "❌ Not enough stock available.",
        INSUFFICIENT_FUNDS: "❌ You don't have enough funds.",
        CAPACITY_EXCEEDED: "❌ This would exceed your inventory capacity.",
        INVALID_QUANTITY: "❌ Invalid quantity.",
        TRANSACTION_FAILED: "❌ Transaction failed. Please try again.",
      };

      const message = errorMessages[error.code] ?? `❌ ${error.message}`;

      await ctx.editOrReply({
        content: message,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const purchase = result.unwrap();
    const currency = currencyRegistry.get(purchase.guildId) ?? { display: (v: number) => `${v} coins` };

    await ctx.editOrReply({
      content:
        `✅ **Purchase successful!**\n` +
        `📦 ${purchase.quantity}x ${itemDef.name}\n` +
        `💰 Total: ${currency.display(purchase.totalPaid as any)} (tax: ${currency.display(purchase.tax as any)})\n` +
        `📊 Remaining stock: ${purchase.remainingStock === Infinity ? "Unlimited" : purchase.remainingStock}\n` +
        `📦 Inventory: ${purchase.capacity.currentSlots}/${purchase.capacity.maxSlots} slots, ` +
        `${purchase.capacity.currentWeight}/${purchase.capacity.maxWeight} weight`,
    });
  }
}

@Declare({
  name: "store-sell",
  description: "Sell an item to the store",
})
@Options(sellOptions)
export class StoreSellCommand extends Command {
  async run(ctx: CommandContext<typeof sellOptions>) {
    const guildId = ctx.guildId;

    if (!guildId) {
      await ctx.write({
        content: "❌ This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { item: itemId, quantity = 1 } = ctx.options;
    const sellerId = ctx.author.id;

    // Get item definition for display
    const itemDef = ITEM_DEFINITIONS[itemId];
    if (!itemDef) {
      await ctx.write({
        content: "❌ Item not found.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Show processing message
    await ctx.write({
      content: `💰 Processing sale of ${quantity}x ${itemDef.name}...`,
      flags: MessageFlags.Ephemeral,
    });

    // Execute sale
    const result = await storeService.sellItem({
      sellerId,
      guildId,
      itemId,
      quantity,
    });

    if (result.isErr()) {
      const error = result.error as StoreError;

      const errorMessages: Record<string, string> = {
        STORE_CLOSED: "❌ The store is currently closed.",
        ITEM_NOT_FOUND: "❌ Item not recognized.",
        INSUFFICIENT_INVENTORY: "❌ You don't have enough of this item.",
        GUILD_LIQUIDITY_INSUFFICIENT: "❌ The store cannot afford to buy this item right now.",
        INVALID_QUANTITY: "❌ Invalid quantity.",
        TRANSACTION_FAILED: "❌ Transaction failed. Please try again.",
      };

      const message = errorMessages[error.code] ?? `❌ ${error.message}`;

      await ctx.editOrReply({
        content: message,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const sale = result.unwrap();
    const currency = currencyRegistry.get(sale.guildId) ?? { display: (v: number) => `${v} coins` };

    const taxInfo = sale.tax > 0 ? ` (tax: ${currency.display(sale.tax as any)})` : "";

    await ctx.editOrReply({
      content:
        `✅ **Sale successful!**\n` +
        `📦 Sold: ${sale.quantity}x ${itemDef.name}\n` +
        `💰 Received: ${currency.display(sale.totalReceived as any)}${taxInfo}\n` +
        `💵 Unit price: ${currency.display(sale.unitPrice as any)} (~85% of base value)`,
    });
  }
}

@Declare({
  name: "store-list",
  description: "List available items in the store",
})
export class StoreListCommand extends Command {
  async run(ctx: CommandContext) {
    await listItems(ctx);
  }
}

async function listItems(ctx: CommandContext) {
  const guildId = ctx.guildId;

  if (!guildId) {
    await ctx.write({
      content: "❌ This command can only be used in a server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const result = await storeService.listAvailableItems(guildId);

  if (result.isErr()) {
    await ctx.write({
      content: "❌ Could not retrieve store catalog.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const items = result.unwrap();

  if (items.length === 0) {
    await ctx.write({
      content: "🏪 **Guild Store**\n\nNo items available at the moment.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Group by category
  const byCategory: Record<string, typeof items> = {};
  for (const item of items) {
    const cat = item.category || "General";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }

  let content = "🏪 **Guild Store**\n\n";

  for (const [category, catItems] of Object.entries(byCategory)) {
    content += `**${category}**\n`;
    for (const item of catItems) {
      const stockDisplay = item.stock < 0 ? "∞" : item.stock;
      content += `• \`${item.itemId}\` **${item.name}** - ${item.buyPrice} coins (stock: ${stockDisplay})\n`;
    }
    content += "\n";
  }

  content += "Use `/store-buy item:<id>` to purchase items.\n";
  content += "Use `/store-sell item:<id>` to sell items.";

  await ctx.write({
    content,
    flags: MessageFlags.Ephemeral,
  });
}
