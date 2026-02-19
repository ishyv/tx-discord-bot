/**
 * Market Command.
 *
 * Purpose: Interactive player marketplace UI.
 */

import {
  ActionRow,
  Command,
  Declare,
  StringSelectMenu,
  StringSelectOption,
  type CommandContext,
} from "seyfert";
import { Button, UI } from "@/modules/ui";
import { ButtonStyle, MessageFlags } from "seyfert/lib/types";
import { BindDisabled, Features } from "@/modules/features";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { getItemDefinition } from "@/modules/inventory/items";
import {
  MARKET_CATEGORIES,
  MarketError,
  categoryLabel,
  type MarketBrowseIndexEntry,
  type MarketCategory,
  type MarketListingView,
  type SellableItemView,
  marketService,
} from "@/modules/market";
import {
  buildBrowseEmbed,
  buildMarketHelpEmbed,
  buildMarketMainEmbed,
  buildMyListingsEmbed,
  buildSellEmbed,
} from "@/modules/market/views";

type Screen = "main" | "browse" | "sell" | "mine" | "help";

type MarketUIState = {
  screen: Screen;
  feedback: string | null;
  category: MarketCategory | null;
  browseIndex: MarketBrowseIndexEntry[];
  sellItems: SellableItemView[];
  listings: MarketListingView[];
  myListings: MarketListingView[];
  selectedItemId: string | null;
  selectedListingId: string | null;
  quantity: number;
  price: number;
  awaitingBuyConfirm: boolean;
  awaitingCancelConfirm: boolean;
};

const quantitySteps = [1, 5, 10, 25] as const;

function toErrorMessage(error: unknown): string {
  if (error instanceof MarketError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Operation unavailable.";
}

function categoryOptions(active: MarketCategory | null): StringSelectOption[] {
  return MARKET_CATEGORIES.map((category) => {
    const option = new StringSelectOption()
      .setLabel(categoryLabel(category))
      .setValue(category);
    if (active === category) {
      option.setDefault(true);
    }
    return option;
  });
}

function itemOptionsFromIndex(
  index: readonly MarketBrowseIndexEntry[],
  selectedItemId: string | null,
): StringSelectOption[] {
  return index.slice(0, 25).map((entry) => {
    const def = getItemDefinition(entry.itemId);
    const option = new StringSelectOption()
      .setLabel(def?.name ?? entry.itemId)
      .setValue(entry.itemId)
      .setDescription(
        `${entry.listingCount} listings - from ${entry.cheapestPrice}`,
      );
    if (selectedItemId === entry.itemId) {
      option.setDefault(true);
    }
    return option;
  });
}

function listingOptions(
  listings: readonly MarketListingView[],
  selectedListingId: string | null,
): StringSelectOption[] {
  return listings.slice(0, 25).map((listing) => {
    const shortId = listing.listingId.slice(-8);
    const option = new StringSelectOption()
      .setLabel(`#${shortId} - ${listing.pricePerUnit} ea`)
      .setValue(listing.listingId)
      .setDescription(
        listing.itemKind === "instance"
          ? "Instance listing"
          : `Qty ${listing.quantity} - seller ${listing.sellerId}`,
      );
    if (selectedListingId === listing.listingId) {
      option.setDefault(true);
    }
    return option;
  });
}

function sellableItemOptions(
  items: readonly SellableItemView[],
  selectedItemId: string | null,
): StringSelectOption[] {
  return items.slice(0, 25).map((item) => {
    const def = getItemDefinition(item.itemId);
    const option = new StringSelectOption()
      .setLabel(def?.name ?? item.itemId)
      .setValue(item.itemId)
      .setDescription(`qty ${item.quantity} - ${item.itemKind}`);
    if (selectedItemId === item.itemId) {
      option.setDefault(true);
    }
    return option;
  });
}

function myListingOptions(
  listings: readonly MarketListingView[],
  selectedListingId: string | null,
): StringSelectOption[] {
  return listings.slice(0, 25).map((listing) => {
    const def = getItemDefinition(listing.itemId);
    const option = new StringSelectOption()
      .setLabel(`${def?.name ?? listing.itemId} - ${listing.pricePerUnit}`)
      .setValue(listing.listingId)
      .setDescription(`qty ${listing.quantity} - id ${listing.listingId.slice(-8)}`);
    if (selectedListingId === listing.listingId) {
      option.setDefault(true);
    }
    return option;
  });
}

function capQuantityForListing(
  listing: MarketListingView,
  requested: number,
): number {
  if (listing.itemKind === "instance") return 1;
  return Math.max(1, Math.min(requested, listing.quantity));
}

function capQuantityForSellItem(item: SellableItemView, requested: number): number {
  if (item.itemKind === "instance") return 1;
  return Math.max(1, Math.min(requested, item.quantity));
}

async function loadBrowseData(
  guildId: string,
  category: MarketCategory | null,
): Promise<{ index: MarketBrowseIndexEntry[]; error?: string }> {
  if (!category) {
    return { index: [] };
  }
  const result = await marketService.browseIndex(guildId, category);
  if (result.isErr()) {
    return { index: [], error: toErrorMessage(result.error) };
  }
  return { index: result.unwrap() };
}

async function loadListingsData(
  guildId: string,
  itemId: string | null,
): Promise<{ listings: MarketListingView[]; error?: string }> {
  if (!itemId) return { listings: [] };
  const result = await marketService.getListingsForItem(guildId, itemId);
  if (result.isErr()) {
    return { listings: [], error: toErrorMessage(result.error) };
  }
  return { listings: result.unwrap() };
}

async function loadSellItemsData(
  guildId: string,
  userId: string,
  category: MarketCategory | null,
): Promise<{ items: SellableItemView[]; error?: string }> {
  const result = await marketService.getSellableItems(
    guildId,
    userId,
    category ?? undefined,
  );
  if (result.isErr()) {
    return { items: [], error: toErrorMessage(result.error) };
  }
  return { items: result.unwrap() };
}

async function loadMyListingsData(
  guildId: string,
  userId: string,
): Promise<{ listings: MarketListingView[]; error?: string }> {
  const result = await marketService.getMyListings(guildId, userId);
  if (result.isErr()) {
    return { listings: [], error: toErrorMessage(result.error) };
  }
  return { listings: result.unwrap() };
}

@HelpDoc({
  command: "market",
  category: HelpCategory.Economy,
  description: "Interactive player-to-player marketplace for buying and selling items",
  usage: "/market",
  notes: "Listings are finite-supply. Use the interactive UI to browse, list, or buy.",
})
@Declare({
  name: "market",
  description: "Player marketplace (finite-supply listings)",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 2000,
  uses: { default: 1 },
})
export default class MarketCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        content: "This command can only be used within a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await ctx.deferReply(true);

    const ui = new UI<MarketUIState>(
      {
        screen: "main",
        feedback: null,
        category: null,
        browseIndex: [],
        sellItems: [],
        listings: [],
        myListings: [],
        selectedItemId: null,
        selectedListingId: null,
        quantity: 1,
        price: 1,
        awaitingBuyConfirm: false,
        awaitingCancelConfirm: false,
      },
      (state) => {
        const rows: ActionRow<any>[] = [];

        if (state.screen === "main") {
          const browse = new Button()
            .setLabel("Browse")
            .setStyle(ButtonStyle.Primary)
            .onClick("market_main_browse", async () => {
              state.screen = "browse";
              state.feedback = null;
            });
          const sell = new Button()
            .setLabel("Sell")
            .setStyle(ButtonStyle.Success)
            .onClick("market_main_sell", async () => {
              state.screen = "sell";
              state.feedback = null;
              state.category = null;
              state.sellItems = [];
              state.selectedItemId = null;
              state.quantity = 1;
              state.price = 1;
            });
          const mine = new Button()
            .setLabel("My Listings")
            .setStyle(ButtonStyle.Secondary)
            .onClick("market_main_mine", async () => {
              state.screen = "mine";
              const loaded = await loadMyListingsData(guildId, ctx.author.id);
              state.myListings = loaded.listings;
              state.feedback = loaded.error ?? null;
              state.selectedListingId = null;
              state.awaitingCancelConfirm = false;
            });
          const help = new Button()
            .setLabel("Help")
            .setStyle(ButtonStyle.Secondary)
            .onClick("market_main_help", async () => {
              state.screen = "help";
              state.feedback = null;
            });

          rows.push(new ActionRow<Button>().addComponents(browse, sell, mine, help));
          return {
            embeds: [buildMarketMainEmbed(state.feedback ?? undefined)],
            components: rows,
            flags: MessageFlags.Ephemeral,
          };
        }

        if (state.screen === "help") {
          const back = new Button()
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary)
            .onClick("market_help_back", async () => {
              state.screen = "main";
            });
          rows.push(new ActionRow<Button>().addComponents(back));
          return {
            embeds: [buildMarketHelpEmbed()],
            components: rows,
            flags: MessageFlags.Ephemeral,
          };
        }

        if (state.screen === "browse") {
          const catMenu = new StringSelectMenu()
            .setPlaceholder("Category")
            .setValuesLength({ min: 1, max: 1 })
            .setOptions(categoryOptions(state.category))
            .onSelect("market_browse_category", async (menuCtx) => {
              const nextCategory = menuCtx.interaction.values?.[0] as MarketCategory | undefined;
              if (!nextCategory) return;
              state.category = nextCategory;
              state.selectedItemId = null;
              state.selectedListingId = null;
              state.quantity = 1;
              state.awaitingBuyConfirm = false;
              const loaded = await loadBrowseData(guildId, nextCategory);
              state.browseIndex = loaded.index;
              state.listings = [];
              state.feedback = loaded.error ?? null;
            });

          rows.push(new ActionRow<StringSelectMenu>().addComponents(catMenu));

          if (state.category && state.browseIndex.length > 0) {
            const itemMenu = new StringSelectMenu()
              .setPlaceholder("Item")
              .setValuesLength({ min: 1, max: 1 })
              .setOptions(itemOptionsFromIndex(state.browseIndex, state.selectedItemId))
              .onSelect("market_browse_item", async (menuCtx) => {
                const nextItem = menuCtx.interaction.values?.[0] ?? null;
                state.selectedItemId = nextItem;
                state.selectedListingId = null;
                state.quantity = 1;
                state.awaitingBuyConfirm = false;
                const loadedListings = await loadListingsData(guildId, nextItem);
                state.listings = loadedListings.listings;
                state.feedback = loadedListings.error ?? null;
              });
            rows.push(new ActionRow<StringSelectMenu>().addComponents(itemMenu));
          }

          if (state.selectedItemId && state.listings.length > 0) {
            const listingMenu = new StringSelectMenu()
              .setPlaceholder("Listing")
              .setValuesLength({ min: 1, max: 1 })
              .setOptions(listingOptions(state.listings, state.selectedListingId))
              .onSelect("market_browse_listing", async (menuCtx) => {
                const listingId = menuCtx.interaction.values?.[0] ?? null;
                state.selectedListingId = listingId;
                state.awaitingBuyConfirm = false;
                const selected = state.listings.find((entry) => entry.listingId === listingId);
                if (selected) {
                  state.quantity = capQuantityForListing(selected, state.quantity);
                }
              });
            rows.push(new ActionRow<StringSelectMenu>().addComponents(listingMenu));

            const selectedListing = state.listings.find(
              (entry) => entry.listingId === state.selectedListingId,
            );
            const qtyButtons = quantitySteps.map((step) =>
              new Button()
                .setLabel(String(step))
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!selectedListing || selectedListing.itemKind === "instance")
                .onClick(`market_browse_qty_${step}`, async () => {
                  if (!selectedListing) return;
                  state.quantity = capQuantityForListing(selectedListing, step);
                  state.awaitingBuyConfirm = false;
                }),
            );
            const qtyMax = new Button()
              .setLabel("Max")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(!selectedListing)
              .onClick("market_browse_qty_max", async () => {
                if (!selectedListing) return;
                state.quantity =
                  selectedListing.itemKind === "instance"
                    ? 1
                    : Math.max(1, selectedListing.quantity);
                state.awaitingBuyConfirm = false;
              });
            rows.push(
              new ActionRow<Button>().addComponents(
                qtyButtons[0],
                qtyButtons[1],
                qtyButtons[2],
                qtyButtons[3],
                qtyMax,
              ),
            );

            const buy = new Button()
              .setLabel(state.awaitingBuyConfirm ? "Confirm Buy" : "Buy")
              .setStyle(state.awaitingBuyConfirm ? ButtonStyle.Success : ButtonStyle.Primary)
              .setDisabled(!selectedListing)
              .onClick("market_browse_buy", async () => {
                if (!selectedListing) return;
                if (!state.awaitingBuyConfirm) {
                  state.awaitingBuyConfirm = true;
                  state.feedback = "Press again to confirm the purchase.";
                  return;
                }

                const result = await marketService.buyListing({
                  guildId,
                  buyerId: ctx.author.id,
                  listingId: selectedListing.listingId,
                  quantity:
                    selectedListing.itemKind === "instance" ? 1 : state.quantity,
                });
                if (result.isErr()) {
                  state.feedback = `❌ ${toErrorMessage(result.error)}`;
                  state.awaitingBuyConfirm = false;
                  return;
                }

                state.feedback = `✅ Purchase completed. Total: ${result.unwrap().total}`;
                state.awaitingBuyConfirm = false;

                const refreshListings = await loadListingsData(guildId, state.selectedItemId);
                state.listings = refreshListings.listings;
                state.selectedListingId = null;
                state.quantity = 1;
              });
            const back = new Button()
              .setLabel("Back")
              .setStyle(ButtonStyle.Secondary)
              .onClick("market_browse_back", async () => {
                state.screen = "main";
                state.feedback = null;
              });
            rows.push(new ActionRow<Button>().addComponents(buy, back));
          } else {
            const back = new Button()
              .setLabel("Back")
              .setStyle(ButtonStyle.Secondary)
              .onClick("market_browse_back_2", async () => {
                state.screen = "main";
                state.feedback = null;
              });
            rows.push(new ActionRow<Button>().addComponents(back));
          }

          return {
            embeds: [
              buildBrowseEmbed(
                state.category,
                state.browseIndex,
                state.listings,
                state.selectedItemId,
                state.quantity,
                state.feedback ?? undefined,
              ),
            ],
            components: rows,
            flags: MessageFlags.Ephemeral,
          };
        }

        if (state.screen === "sell") {
          const catMenu = new StringSelectMenu()
            .setPlaceholder("Category")
            .setValuesLength({ min: 1, max: 1 })
            .setOptions(categoryOptions(state.category))
            .onSelect("market_sell_category", async (menuCtx) => {
              const nextCategory = menuCtx.interaction.values?.[0] as MarketCategory | undefined;
              if (!nextCategory) return;
              state.category = nextCategory;
              state.selectedItemId = null;
              state.quantity = 1;
              state.price = 1;
              const loaded = await loadSellItemsData(guildId, ctx.author.id, nextCategory);
              state.sellItems = loaded.items;
              state.feedback = loaded.error ?? null;
            });
          rows.push(new ActionRow<StringSelectMenu>().addComponents(catMenu));

          if (state.sellItems.length > 0) {
            const itemMenu = new StringSelectMenu()
              .setPlaceholder("Item")
              .setValuesLength({ min: 1, max: 1 })
              .setOptions(sellableItemOptions(state.sellItems, state.selectedItemId))
              .onSelect("market_sell_item", async (menuCtx) => {
                const nextItem = menuCtx.interaction.values?.[0] ?? null;
                state.selectedItemId = nextItem;
                state.quantity = 1;
                const selected = state.sellItems.find((entry) => entry.itemId === nextItem);
                state.price = selected?.suggestedPrice ?? selected?.minPrice ?? 1;
                state.feedback = null;
              });
            rows.push(new ActionRow<StringSelectMenu>().addComponents(itemMenu));
          }

          const selectedSellItem = state.sellItems.find(
            (entry) => entry.itemId === state.selectedItemId,
          );
          if (selectedSellItem) {
            const qtyButtons = quantitySteps.map((step) =>
              new Button()
                .setLabel(String(step))
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(selectedSellItem.itemKind === "instance")
                .onClick(`market_sell_qty_${step}`, async () => {
                  state.quantity = capQuantityForSellItem(selectedSellItem, step);
                }),
            );
            const qtyMax = new Button()
              .setLabel("Max")
              .setStyle(ButtonStyle.Secondary)
              .onClick("market_sell_qty_max", async () => {
                state.quantity =
                  selectedSellItem.itemKind === "instance"
                    ? 1
                    : Math.max(1, selectedSellItem.quantity);
              });
            rows.push(
              new ActionRow<Button>().addComponents(
                qtyButtons[0],
                qtyButtons[1],
                qtyButtons[2],
                qtyButtons[3],
                qtyMax,
              ),
            );

            const priceDown = new Button()
              .setLabel("-10")
              .setStyle(ButtonStyle.Secondary)
              .onClick("market_sell_price_down", async () => {
                const min = selectedSellItem.minPrice ?? 1;
                state.price = Math.max(min, state.price - 10);
              });
            const priceUp = new Button()
              .setLabel("+10")
              .setStyle(ButtonStyle.Secondary)
              .onClick("market_sell_price_up", async () => {
                const max = selectedSellItem.maxPrice ?? Number.MAX_SAFE_INTEGER;
                state.price = Math.min(max, state.price + 10);
              });
            const priceSuggested = new Button()
              .setLabel("Suggested")
              .setStyle(ButtonStyle.Primary)
              .onClick("market_sell_price_suggested", async () => {
                state.price =
                  selectedSellItem.suggestedPrice ?? selectedSellItem.minPrice ?? 1;
              });
            rows.push(
              new ActionRow<Button>().addComponents(
                priceDown,
                priceUp,
                priceSuggested,
              ),
            );

            const confirm = new Button()
              .setLabel("Confirm Listing")
              .setStyle(ButtonStyle.Success)
              .onClick("market_sell_confirm", async () => {
                const listResult = await marketService.listItem({
                  guildId,
                  sellerId: ctx.author.id,
                  itemId: selectedSellItem.itemId,
                  quantity:
                    selectedSellItem.itemKind === "instance" ? 1 : state.quantity,
                  pricePerUnit: state.price,
                });
                if (listResult.isErr()) {
                  state.feedback = `❌ ${toErrorMessage(listResult.error)}`;
                  return;
                }

                state.feedback = `✅ Listing created: ${listResult.unwrap().listingId.slice(-8)}`;
                const reload = await loadSellItemsData(guildId, ctx.author.id, state.category);
                state.sellItems = reload.items;
                state.selectedItemId = null;
                state.quantity = 1;
              });
            const back = new Button()
              .setLabel("Back")
              .setStyle(ButtonStyle.Secondary)
              .onClick("market_sell_back", async () => {
                state.screen = "main";
              });
            rows.push(new ActionRow<Button>().addComponents(confirm, back));
          } else {
            const back = new Button()
              .setLabel("Back")
              .setStyle(ButtonStyle.Secondary)
              .onClick("market_sell_back_2", async () => {
                state.screen = "main";
              });
            rows.push(new ActionRow<Button>().addComponents(back));
          }

          return {
            embeds: [
              buildSellEmbed(
                state.category,
                state.sellItems,
                state.selectedItemId,
                state.quantity,
                state.price,
                state.feedback ?? undefined,
              ),
            ],
            components: rows,
            flags: MessageFlags.Ephemeral,
          };
        }

        const listingMenu = new StringSelectMenu()
          .setPlaceholder("Select listing")
          .setValuesLength({ min: 1, max: 1 })
          .setOptions(
            state.myListings.length > 0
              ? myListingOptions(state.myListings, state.selectedListingId)
              : [
                  new StringSelectOption()
                    .setLabel("No active listings")
                    .setValue("none")
                    .setDescription("Create one from Sell"),
                ],
          )
          .setDisabled(state.myListings.length === 0)
          .onSelect("market_mine_select", async (menuCtx) => {
            state.selectedListingId = menuCtx.interaction.values?.[0] ?? null;
            state.awaitingCancelConfirm = false;
          });
        rows.push(new ActionRow<StringSelectMenu>().addComponents(listingMenu));

        const cancel = new Button()
          .setLabel(state.awaitingCancelConfirm ? "Confirm Cancel" : "Cancel Listing")
          .setStyle(state.awaitingCancelConfirm ? ButtonStyle.Danger : ButtonStyle.Secondary)
          .setDisabled(!state.selectedListingId)
          .onClick("market_mine_cancel", async () => {
            if (!state.selectedListingId) return;
            if (!state.awaitingCancelConfirm) {
              state.awaitingCancelConfirm = true;
              state.feedback = "Press again to confirm the cancellation.";
              return;
            }
            const result = await marketService.cancelListing({
              guildId,
              actorId: ctx.author.id,
              listingId: state.selectedListingId,
            });
            if (result.isErr()) {
              state.feedback = `❌ ${toErrorMessage(result.error)}`;
              state.awaitingCancelConfirm = false;
              return;
            }
            state.feedback = "✅ Listing canceled.";
            state.awaitingCancelConfirm = false;
            state.selectedListingId = null;
            const refresh = await loadMyListingsData(guildId, ctx.author.id);
            state.myListings = refresh.listings;
          });
        const back = new Button()
          .setLabel("Back")
          .setStyle(ButtonStyle.Secondary)
          .onClick("market_mine_back", async () => {
            state.screen = "main";
            state.feedback = null;
          });
        rows.push(new ActionRow<Button>().addComponents(cancel, back));

        return {
          embeds: [buildMyListingsEmbed(state.myListings, state.feedback ?? undefined)],
          components: rows,
          flags: MessageFlags.Ephemeral,
        };
      },
      (msg) => ctx.editOrReply(msg),
    );

    await ui.send();
  }
}
