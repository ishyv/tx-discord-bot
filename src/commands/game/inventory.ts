/**
 * Inventory Command (Refactored for Phase 12.2).
 *
 * Purpose: Display user inventory with pagination, filtering, and inspection.
 * Changes:
 * - Added category filtering
 * - Added inspection select menu
 * - Improved display for instances
 */

import {
  Command,
  Declare,
  Options,
  createStringOption,
  createIntegerOption,
  type CommandContext,
  Embed,
  ActionRow,
  ComponentContext,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { BindDisabled, Features } from "@/modules/features";
import { startPagination } from "@/modules/prefabs/pagination";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
  economyAccountRepo,
  createEconomyAccountService,
  buildInventoryPageEmbed,
  buildAccessDeniedEmbed,
  buildErrorEmbed,
  EconomyError,
  DEFAULT_INVENTORY_PAGINATION,
} from "@/modules/economy";
import { createSelectMenu, replyEphemeral } from "@/adapters/seyfert";
import { getItemDefinition } from "@/modules/inventory/items";
import { UIColors } from "@/modules/ui/design-system";

// Service instance
const economyService = createEconomyAccountService(economyAccountRepo);

const options = {
  search: createStringOption({
    description: "Search items by name",
    required: false,
  }),
  category: createStringOption({
    description: "Filter by category",
    required: false,
    choices: [
      { name: "All", value: "all" },
      { name: "Gear", value: "gear" },
      { name: "Tools", value: "tools" },
      { name: "Materials", value: "materials" },
      { name: "Quest", value: "quest" },
    ],
  }),
  page: createIntegerOption({
    description: "Page number",
    required: false,
    min_value: 1,
  }),
};

@Declare({
  name: "inventory",
  description: "Displays the items you own in your inventory.",
})
@Options(options)
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 3000,
  uses: { default: 1 },
})
export default class InventoryCommand extends Command {
  async run(ctx: CommandContext<typeof options>) {
    await ctx.deferReply(true);
    const userId = ctx.author.id;
    const searchTerm = ctx.options.search;
    const categoryFilter = (ctx.options.category as any) || "all";
    const requestedPage = (ctx.options.page ?? 1) - 1; // Convert to 0-based

    // Check access first
    const accessResult = await economyService.checkAccess(userId);
    if (accessResult.isErr()) {
      await ctx.editOrReply({
        embeds: [buildErrorEmbed("Error verifying access.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const access = accessResult.unwrap();
    if (!access.allowed) {
      await ctx.editOrReply({
        embeds: [buildAccessDeniedEmbed((access.status as any) ?? "blocked")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get inventory page
    const result = await economyService.getInventoryPage(userId, {
      page: requestedPage,
      pageSize: DEFAULT_INVENTORY_PAGINATION.pageSize,
      sortBy: "name",
      sortOrder: "asc",
      search: searchTerm,
      filter: categoryFilter,
    });

    if (result.isErr()) {
      const error = result.error;
      if (error instanceof EconomyError) {
        if (
          error.code === "ACCOUNT_BLOCKED" ||
          error.code === "ACCOUNT_BANNED"
        ) {
          await ctx.editOrReply({
            embeds: [
              buildAccessDeniedEmbed(
                error.code === "ACCOUNT_BANNED" ? "banned" : "blocked",
              ),
            ],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      await ctx.editOrReply({
        embeds: [buildErrorEmbed("Unable to load your inventory.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const pageView = result.unwrap();

    // Helper to add components (inspect menu)
    const getComponents = (items: typeof pageView.items) => {
      if (items.length === 0) return [];

      const selectOptions = items.slice(0, 25).map((item) => ({
        label: item.name,
        value: item.id,
        description: item.description?.slice(0, 50) || "No description",
        // Note: emoji parsing omitted for simplicity/compatibility
      }));

      const menu = createSelectMenu({
        customId: `inv_inspect_${userId}`,
        placeholder: "🔍 Inspect an item...",
        options: selectOptions,
      });

      return [new ActionRow<typeof menu>().addComponents(menu)];
    };

    // If single page, show directly
    if (pageView.totalPages <= 1 && !searchTerm && categoryFilter === "all") {
      const embed = buildInventoryPageEmbed(
        pageView,
        ctx.author.username,
        ctx.author.avatarURL(),
      );

      // Add filter indication to title if needed
      if (categoryFilter !== "all") {
        embed.setTitle(`🎒 Inventory (${categoryFilter})`);
      }

      if (pageView.items.length === 0) {
        embed.setDescription(
          "🎒 **Your inventory is empty**\n\n" +
          "Use the store or participate in events to obtain items.",
        );
      }

      await ctx.editOrReply({
        embeds: [embed],
        components: getComponents(pageView.items),
      });
      return;
    }

    // Pagination
    await startPagination({
      totalPages: pageView.totalPages,
      initialPage: pageView.page,
      ownerId: ctx.author.id,
      sender: (msg) => ctx.editOrReply(msg),
      // @ts-ignore - complex pagination types
      buildPage: async (page) => {
        // Re-fetch for updated page
        const pResult = await economyService.getInventoryPage(userId, {
          page: page,
          pageSize: DEFAULT_INVENTORY_PAGINATION.pageSize,
          sortBy: "name",
          sortOrder: "asc",
          search: searchTerm,
          filter: categoryFilter,
        });

        if (pResult.isErr()) {
          return { embeds: [buildErrorEmbed("Failed to load page")] };
        }

        const pView = pResult.unwrap();
        const embed = buildInventoryPageEmbed(
          pView,
          ctx.author.username,
          ctx.author.avatarURL(),
        );

        if (categoryFilter !== "all") {
          embed.setTitle(`🎒 Inventory (${categoryFilter})`);
        }

        return {
          embeds: [embed],
          components: getComponents(pView.items),
        };
      },
      labels: {
        previous: "◀ Previous",
        select: "📄 Page",
        next: "Next ▶",
      },
    });
  }
}

// Handler for inspect menu
@Declare({
  name: "inv_inspect",
  description: "Inspect inventory item"
})
export class InventoryInspectHandler extends Command {
  // @ts-ignore - Component context
  async run(ctx: ComponentContext) {
    // @ts-ignore
    const selectedValue = ctx.values?.[0];

    if (!selectedValue) return;

    const def = getItemDefinition(selectedValue);
    if (!def) {
      // @ts-ignore
      await replyEphemeral(ctx, { content: "Item definition not found." });
      return;
    }

    const embed = new Embed()
      .setColor(UIColors.info)
      .setTitle(`${def.emoji ?? "📦"} ${def.name}`)
      .setDescription(def.description);

    // Add stats if available
    if (def.stats) {
      const stats = [];
      if (def.stats.atk) stats.push(`⚔️ ATK: ${def.stats.atk}`);
      if (def.stats.def) stats.push(`🛡️ DEF: ${def.stats.def}`);
      if (def.stats.hp) stats.push(`❤️ HP: ${def.stats.hp}`);

      if (stats.length > 0) {
        embed.addFields({ name: "Stats", value: stats.join("\n"), inline: true });
      }
    }

    // Add tool info
    if (def.tool) {
      embed.addFields({
        name: "Tool",
        value: `Kind: ${def.tool.toolKind}\nTier: ${def.tool.tier}\nMax Durability: ${def.tool.maxDurability}`,
        inline: true
      });
    }

    // Add other info
    embed.addFields({
      name: "Info",
      value: `Category: ${def.rpgSlot ? "Gear" : (def.tool ? "Tool" : "Item")}\nStackable: ${def.canStack !== false ? "Yes" : "No"}\nWeight: ${def.weight ?? 1}`,
      inline: false
    });

    // @ts-ignore
    await replyEphemeral(ctx, { embeds: [embed] });
  }
}
