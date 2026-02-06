/**
 * Marketplace UI builders.
 *
 * Purpose: Keep embed formatting centralized for command handlers.
 */

import { Embed } from "seyfert";
import { UIColors } from "@/modules/ui/design-system";
import { getItemDefinition } from "@/modules/inventory/items";
import type {
  MarketBrowseIndexEntry,
  MarketCategory,
  MarketListingView,
  SellableItemView,
} from "./types";
import { categoryLabel } from "./types";

function formatRelativeDate(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

function durabilityBar(current: number, max: number): string {
  if (max <= 0) return "-----";
  const ratio = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(ratio * 5);
  return `${"█".repeat(filled)}${"░".repeat(5 - filled)}`;
}

export function buildMarketMainEmbed(feedback?: string): Embed {
  const embed = new Embed()
    .setColor(UIColors.info)
    .setTitle("Player Marketplace")
    .setDescription(
      [
        "Buy and sell finite-supply items between players.",
        "",
        "• `Browse`: Explore categories, items, and listings.",
        "• `Sell`: List an item with escrow.",
        "• `My Listings`: Manage your active listings.",
        "• `Help`: Rules and quick notes.",
      ].join("\n"),
    );

  if (feedback) {
    embed.addFields({
      name: "Status",
      value: feedback,
    });
  }

  return embed;
}

export function buildBrowseEmbed(
  category: MarketCategory | null,
  index: readonly MarketBrowseIndexEntry[],
  listings: readonly MarketListingView[],
  selectedItemId: string | null,
  selectedQty: number,
  feedback?: string,
): Embed {
  const titleCategory = category ? ` - ${categoryLabel(category)}` : "";
  const embed = new Embed()
    .setColor(UIColors.info)
    .setTitle(`Marketplace Browse${titleCategory}`)
    .setDescription(
      category
        ? "Select a listed item, then choose a listing."
        : "Select a category to view listed items.",
    );

  if (index.length === 0) {
    embed.addFields({
      name: "Index",
      value: "No items are listed in this category.",
    });
  } else {
    const lines = index.slice(0, 15).map((entry) => {
      const def = getItemDefinition(entry.itemId);
      const name = def?.name ?? entry.itemId;
      return `• ${name} — ${entry.listingCount} listings — from **${entry.cheapestPrice}**`;
    });
    embed.addFields({
      name: "Item Index",
      value: lines.join("\n"),
    });
  }

  if (selectedItemId) {
    const selectedDef = getItemDefinition(selectedItemId);
    const selectedName = selectedDef?.name ?? selectedItemId;
    if (listings.length === 0) {
      embed.addFields({
        name: `Listings: ${selectedName}`,
        value: "No active listings.",
      });
    } else {
      const lines = listings.slice(0, 10).map((listing, idx) => {
        if (listing.itemKind === "instance" && listing.instance) {
          const maxDurability = selectedDef?.tool?.maxDurability ?? 100;
          const bar = durabilityBar(listing.instance.durability, maxDurability);
          return `#${idx + 1} ${listing.pricePerUnit} | instance \`${listing.instance.instanceId}\` | dur ${bar} ${listing.instance.durability}/${maxDurability}`;
        }

        return `#${idx + 1} ${listing.pricePerUnit} ea | qty ${listing.quantity} | seller <@${listing.sellerId}> | ${formatRelativeDate(listing.createdAt)}`;
      });

      embed.addFields({
        name: `Listings: ${selectedName}`,
        value: lines.join("\n"),
      });
      embed.addFields({
        name: "Purchase",
        value: `Selected quantity: **${selectedQty}**`,
      });
    }
  }

  if (feedback) {
    embed.addFields({
      name: "Status",
      value: feedback,
    });
  }

  return embed;
}

export function buildSellEmbed(
  category: MarketCategory | null,
  items: readonly SellableItemView[],
  selectedItemId: string | null,
  selectedQty: number,
  selectedPrice: number,
  feedback?: string,
): Embed {
  const embed = new Embed()
    .setColor(UIColors.success)
    .setTitle("Marketplace Sell")
    .setDescription(
      category
        ? `Active category: **${categoryLabel(category)}**`
        : "Select a category to list tradable items.",
    );

  if (items.length === 0) {
    embed.addFields({
      name: "Tradable Inventory",
      value: "You have no tradable items in this view.",
    });
  } else {
    const lines = items.slice(0, 15).map((item) => {
      const def = getItemDefinition(item.itemId);
      const name = def?.name ?? item.itemId;
      const type = item.itemKind === "instance" ? "instance" : "stack";
      return `• ${name} | ${type} | qty ${item.quantity}`;
    });
    embed.addFields({
      name: "Available Items",
      value: lines.join("\n"),
    });
  }

  if (selectedItemId) {
    const def = getItemDefinition(selectedItemId);
    embed.addFields({
      name: "Preview",
      value: [
        `Item: **${def?.name ?? selectedItemId}**`,
        `Quantity: **${selectedQty}**`,
        `Price per unit: **${selectedPrice}**`,
      ].join("\n"),
    });
  }

  if (feedback) {
    embed.addFields({
      name: "Status",
      value: feedback,
    });
  }

  return embed;
}

export function buildMyListingsEmbed(
  listings: readonly MarketListingView[],
  feedback?: string,
): Embed {
  const embed = new Embed()
    .setColor(UIColors.warning)
    .setTitle("My Marketplace Listings")
    .setDescription("Your active listings.");

  if (listings.length === 0) {
    embed.addFields({
      name: "Active",
      value: "You have no active listings.",
    });
  } else {
    const lines = listings.slice(0, 15).map((listing) => {
      const def = getItemDefinition(listing.itemId);
      const name = def?.name ?? listing.itemId;
      return `• \`${listing.listingId.slice(-8)}\` ${name} | ${listing.pricePerUnit} ea | qty ${listing.quantity}`;
    });
    embed.addFields({
      name: "Active",
      value: lines.join("\n"),
    });
  }

  if (feedback) {
    embed.addFields({
      name: "Status",
      value: feedback,
    });
  }

  return embed;
}

export function buildMarketHelpEmbed(): Embed {
  return new Embed()
    .setColor(UIColors.info)
    .setTitle("Marketplace Help")
    .setDescription(
      [
        "Quick rules:",
        "• Only items with `market.tradable=true` can be listed.",
        "• Listing puts the item into escrow (no duplication, no loss).",
        "• You cannot buy your own listing.",
        "• Purchases fail if you lack capacity or funds.",
        "• Tax/Fee is sent to guild sectors.",
      ].join("\n"),
    );
}
