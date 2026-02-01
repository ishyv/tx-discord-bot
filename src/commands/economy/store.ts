/**
 * Store Command (Phase 2e + 9d).
 *
 * Purpose: Buy and sell items at the guild store with featured item rotation.
 * Commands: /store buy, /store sell, /store list, /store featured
 */

import {
  Command,
  CommandContext,
  Declare,
  Options,
  createIntegerOption,
  createStringOption,
  Embed,
  ActionRow,
  Button,
} from "seyfert";
import { MessageFlags, ButtonStyle } from "seyfert/lib/types";
import { UIColors } from "@/modules/ui/design-system";
import { ITEM_DEFINITIONS } from "@/modules/inventory";
import {
  storeService,
  guildEconomyService,
  progressionService,
  guildEconomyRepo,
} from "@/modules/economy";
import { storeRotationService } from "@/modules/economy/store/rotation";
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
    // Default action: list store items with featured section
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

    // Check feature flag
    const guildConfigResult = await guildEconomyRepo.ensure(guildId);
    if (
      guildConfigResult.isOk() &&
      !guildConfigResult.unwrap().features.store
    ) {
      await ctx.write({
        content: "🚫 Store is disabled in this server.",
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
        FEATURE_DISABLED: "🚫 Store is disabled in this server.",
      };

      const message = errorMessages[error.code] ?? `❌ ${error.message}`;

      await ctx.editOrReply({
        content: message,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const purchase = result.unwrap();
    const currency = currencyRegistry.get(purchase.guildId) ?? {
      display: (v: number) => `${v} coins`,
    };

    let levelUpLine = "";
    const configResult = await guildEconomyService.getConfig(guildId);
    if (configResult.isOk()) {
      const xpAmount =
        configResult.unwrap().progression.xpAmounts.store_buy ?? 0;
      if (xpAmount > 0) {
        const xpResult = await progressionService.addXP({
          guildId,
          userId: buyerId,
          sourceOp: "store_buy",
          amount: xpAmount,
          correlationId: purchase.transactionId,
          metadata: {
            itemId,
            quantity,
            totalPaid: purchase.totalPaid,
          },
        });
        if (xpResult.isOk() && xpResult.unwrap().leveledUp) {
          levelUpLine = `\n🎉 Level Up! You're now **Lv.${xpResult.unwrap().afterLevel}**.`;
        }
      }
    }

    await ctx.editOrReply({
      content:
        `✅ **Purchase successful!**\n` +
        `📦 ${purchase.quantity}x ${itemDef.name}\n` +
        `💰 Total: ${currency.display(purchase.totalPaid as any)} (tax: ${currency.display(purchase.tax as any)})\n` +
        `📊 Remaining stock: ${purchase.remainingStock === Infinity ? "Unlimited" : purchase.remainingStock}\n` +
        `📦 Inventory: ${purchase.capacity.currentSlots}/${purchase.capacity.maxSlots} slots, ` +
        `${purchase.capacity.currentWeight}/${purchase.capacity.maxWeight} weight${levelUpLine}`,
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

    // Check feature flag
    const guildConfigResult = await guildEconomyRepo.ensure(guildId);
    if (
      guildConfigResult.isOk() &&
      !guildConfigResult.unwrap().features.store
    ) {
      await ctx.write({
        content: "🚫 Store is disabled in this server.",
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
        GUILD_LIQUIDITY_INSUFFICIENT:
          "❌ The store cannot afford to buy this item right now.",
        INVALID_QUANTITY: "❌ Invalid quantity.",
        TRANSACTION_FAILED: "❌ Transaction failed. Please try again.",
        FEATURE_DISABLED: "🚫 Store is disabled in this server.",
      };

      const message = errorMessages[error.code] ?? `❌ ${error.message}`;

      await ctx.editOrReply({
        content: message,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const sale = result.unwrap();
    const currency = currencyRegistry.get(sale.guildId) ?? {
      display: (v: number) => `${v} coins`,
    };

    const taxInfo =
      sale.tax > 0 ? ` (tax: ${currency.display(sale.tax as any)})` : "";
    let levelUpLine = "";
    const configResult = await guildEconomyService.getConfig(guildId);
    if (configResult.isOk()) {
      const xpAmount =
        configResult.unwrap().progression.xpAmounts.store_sell ?? 0;
      if (xpAmount > 0) {
        const xpResult = await progressionService.addXP({
          guildId,
          userId: sellerId,
          sourceOp: "store_sell",
          amount: xpAmount,
          correlationId: sale.transactionId,
          metadata: {
            itemId,
            quantity,
            totalReceived: sale.totalReceived,
          },
        });
        if (xpResult.isOk() && xpResult.unwrap().leveledUp) {
          levelUpLine = `\n🎉 Level Up! You're now **Lv.${xpResult.unwrap().afterLevel}**.`;
        }
      }
    }

    await ctx.editOrReply({
      content:
        `✅ **Sale successful!**\n` +
        `📦 Sold: ${sale.quantity}x ${itemDef.name}\n` +
        `💰 Received: ${currency.display(sale.totalReceived as any)}${taxInfo}\n` +
        `💵 Unit price: ${currency.display(sale.unitPrice as any)} (~85% of base value)` +
        levelUpLine,
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

@Declare({
  name: "store-featured",
  description: "View today's featured items with special discounts",
})
export class StoreFeaturedCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId;

    if (!guildId) {
      await ctx.write({
        content: "❌ This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check feature flag
    const guildConfigResult = await guildEconomyRepo.ensure(guildId);
    if (guildConfigResult.isOk() && !guildConfigResult.unwrap().features.store) {
      await ctx.write({
        content: "🚫 Store is disabled in this server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get featured items
    const featuredResult = await storeService.getFeaturedItems(guildId);
    const rotationResult = await storeRotationService.getRotation(guildId);

    if (featuredResult.isErr()) {
      await ctx.write({
        content: "❌ Could not retrieve featured items.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const featured = featuredResult.unwrap();

    if (featured.length === 0) {
      await ctx.write({
        content: "🏪 **Featured Items**\n\nNo featured items available at the moment.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const rotation = rotationResult.isOk() ? rotationResult.unwrap() : null;
    const nextRotation = rotation?.nextRotationAt;
    const timeUntil = nextRotation ? Math.ceil((nextRotation.getTime() - Date.now()) / (1000 * 60 * 60)) : 24;

    // Build embed
    const embed = new Embed()
      .setColor(UIColors.gold)
      .setTitle("⭐ Featured Items")
      .setDescription(`Special discounts available for the next ${timeUntil} hours!`);

    // Group by slot type
    const legendary = featured.find((f) => f.slotType === "legendary");
    const daily = featured.filter((f) => f.slotType === "daily");

    if (legendary) {
      const itemDef = ITEM_DEFINITIONS[legendary.itemId];
      const discountPct = Math.round(legendary.discountPct * 100);
      const savings = legendary.originalPrice - legendary.featuredPrice;

      embed.addFields({
        name: `🔥 Legendary - ${itemDef?.name || legendary.itemId}`,
        value:
          `~~${legendary.originalPrice}~~ **${legendary.featuredPrice}** coins (${discountPct}% OFF)\n` +
          `💰 You save: ${savings} coins\n` +
          `📦 Stock: ${legendary.featuredStock < 0 ? "∞" : legendary.featuredStock}`,
        inline: false,
      });
    }

    for (const item of daily) {
      const itemDef = ITEM_DEFINITIONS[item.itemId];
      const discountPct = Math.round(item.discountPct * 100);
      const savings = item.originalPrice - item.featuredPrice;

      embed.addFields({
        name: `⭐ ${itemDef?.name || item.itemId}`,
        value:
          `~~${item.originalPrice}~~ **${item.featuredPrice}** coins (${discountPct}% OFF)\n` +
          `💰 You save: ${savings} coins\n` +
          `📦 Stock: ${item.featuredStock < 0 ? "∞" : item.featuredStock}`,
        inline: true,
      });
    }

    embed.setFooter({ text: "Use /store-buy to purchase featured items at discounted prices!" });

    // Create buy buttons for featured items
    const rows: ActionRow<Button>[] = [];
    const itemsWithButtons = featured.slice(0, 5); // Max 5 buttons

    for (let i = 0; i < itemsWithButtons.length; i += 5) {
      const row = new ActionRow<Button>();
      for (const item of itemsWithButtons.slice(i, i + 5)) {
        const itemDef = ITEM_DEFINITIONS[item.itemId];
        row.addComponents(
          new Button({
            custom_id: `store_buy:${item.itemId}:${ctx.author.id}`,
            label: `Buy ${itemDef?.name || item.itemId}`,
            style: item.slotType === "legendary" ? ButtonStyle.Danger : ButtonStyle.Primary,
          })
        );
      }
      rows.push(row);
    }

    await ctx.write({
      embeds: [embed],
      components: rows,
      flags: MessageFlags.Ephemeral,
    });
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

  // Check feature flag
  const guildConfigResult = await guildEconomyRepo.ensure(guildId);
  if (guildConfigResult.isOk() && !guildConfigResult.unwrap().features.store) {
    await ctx.write({
      content: "🚫 Store is disabled in this server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Get regular items
  const result = await storeService.listAvailableItems(guildId);

  // Get featured items (Phase 9d)
  const featuredResult = await storeService.getFeaturedItems(guildId);

  if (result.isErr()) {
    await ctx.write({
      content: "❌ Could not retrieve store catalog.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const items = result.unwrap();
  const featured = featuredResult.isOk() ? featuredResult.unwrap() : [];
  const featuredIds = new Set(featured.map((f) => f.itemId));

  // Build embed instead of plain text
  const embed = new Embed()
    .setColor(UIColors.gold)
    .setTitle("🏪 Guild Store");

  // Add featured section if available
  if (featured.length > 0) {
    const legendary = featured.find((f) => f.slotType === "legendary");
    const dailyItems = featured.filter((f) => f.slotType === "daily").slice(0, 3);

    let featuredText = "";
    if (legendary) {
      const itemDef = ITEM_DEFINITIONS[legendary.itemId];
      const discount = Math.round(legendary.discountPct * 100);
      featuredText += `🔥 **Legendary**: ${itemDef?.name} - ~~${legendary.originalPrice}~~ **${legendary.featuredPrice}** (${discount}% OFF)\n`;
    }

    for (const item of dailyItems) {
      const itemDef = ITEM_DEFINITIONS[item.itemId];
      const discount = Math.round(item.discountPct * 100);
      featuredText += `⭐ ${itemDef?.name} - ~~${item.originalPrice}~~ **${item.featuredPrice}** (${discount}% OFF)\n`;
    }

    embed.addFields({
      name: "⭐ Featured Items (Limited Time)",
      value: featuredText + "\nUse `/store-featured` to see all featured items!",
      inline: false,
    });
  }

  if (items.length === 0) {
    embed.setDescription("No items available at the moment.");
    await ctx.write({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Filter out featured items from regular listing (to avoid duplication)
  const regularItems = items.filter((item) => !featuredIds.has(item.itemId));

  // Group by category
  const byCategory: Record<string, typeof items> = {};
  for (const item of regularItems) {
    const cat = item.category || "General";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }

  // Add regular items to embed
  for (const [category, catItems] of Object.entries(byCategory).slice(0, 5)) {
    const itemsText = catItems
      .slice(0, 5)
      .map((item) => {
        const stockDisplay = item.stock < 0 ? "∞" : item.stock;
        return `• \`${item.itemId}\` **${item.name}** - ${item.buyPrice} coins (stock: ${stockDisplay})`;
      })
      .join("\n");

    embed.addFields({
      name: category,
      value: itemsText + (catItems.length > 5 ? `\n*...and ${catItems.length - 5} more*` : ""),
      inline: false,
    });
  }

  embed.setFooter({ text: "Use /store-buy item:<id> to purchase • /store-featured for deals!" });

  await ctx.write({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}
