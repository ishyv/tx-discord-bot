import {
    Declare,
    SubCommand,
    Options,
    CommandContext,
    createStringOption,
    createIntegerOption,
    createBooleanOption,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { buildSuccessEmbed, buildErrorEmbed } from "@/modules/ui/design-system";
import { ITEM_DEFINITIONS } from "@/modules/inventory";
import { storeService, economyAuditRepo } from "@/modules/economy";
import { checkEconomyPermission, EconomyPermissionLevel } from "@/modules/economy/permissions";

const options = {
    item: createStringOption({
        description: "Item ID (e.g., stick, sword, or custom-id)",
        required: true,
    }),
    buy_price: createIntegerOption({
        description: "Price to buy (default: item value)",
        required: true,
        min_value: 1,
    }),
    name: createStringOption({
        description: "Display name (required for new custom items)",
        required: false,
    }),
    sell_price: createIntegerOption({
        description: "Price to sell (optional, default: ~85%)",
        required: false,
        min_value: 1,
    }),
    stock: createIntegerOption({
        description: "Initial stock (-1 for unlimited)",
        required: false,
    }),
    category: createStringOption({
        description: "Category for the store",
        required: false,
    }),
    available: createBooleanOption({
        description: "Whether the item is available for purchase (default: true)",
        required: false,
    }),
};

@HelpDoc({
  command: "store-admin add",
  category: HelpCategory.Economy,
  description: "Add a new item listing to the guild store",
  usage: "/store-admin add <item_id> <price> [stock] [enabled]",
  permissions: ["Administrator"],
})
@Declare({
    name: "add",
    description: "Add an item to the store",
})
@Options(options)
export default class StoreAdminAddCommand extends SubCommand {
    async run(ctx: CommandContext<typeof options>) {
        const guildId = ctx.guildId;
        if (!guildId) return;

        // Permission check
        const hasPermission = await checkEconomyPermission(ctx.member, EconomyPermissionLevel.ADMIN);
        if (!hasPermission) {
            return ctx.write({
                embeds: [buildErrorEmbed({ message: "You don't have permission to manage the store." })],
                flags: MessageFlags.Ephemeral,
            });
        }

        const { item: itemId, name, buy_price: buyPrice, sell_price, stock = -1, category, available = true } = ctx.options;

        // Check if it's a known definition
        const itemDef = ITEM_DEFINITIONS[itemId];

        // Determine the name to use
        const finalName = name ?? itemDef?.name;

        // If no name is provided and it's not a known item, we can't proceed
        if (!finalName) {
            return ctx.write({
                embeds: [buildErrorEmbed({ message: "You must provide a 'name' for custom items (items not in standard definitions). " })],
                flags: MessageFlags.Ephemeral,
            });
        }

        const sellPrice = sell_price ?? Math.floor(buyPrice * 0.85);

        const result = await storeService.addItem(guildId, {
            itemId,
            name: finalName,
            buyPrice,
            sellPrice,
            stock,
            available,
            category: category ?? "General",
        });

        if (result.isErr()) {
            return ctx.write({
                embeds: [buildErrorEmbed({ message: `Failed to add item: ${result.error.message}` })],
                flags: MessageFlags.Ephemeral,
            });
        }

        await economyAuditRepo.create({
            operationType: "config_update",
            actorId: ctx.author.id,
            targetId: guildId,
            guildId,
            source: "store-admin add",
            metadata: {
                itemId,
                buyPrice,
                sellPrice,
                stock,
                category,
            },
        });

        return ctx.write({
            embeds: [buildSuccessEmbed({ title: "Item Added", description: `Added **${name ?? itemDef.name}** to the store!` })],
            flags: MessageFlags.Ephemeral,
        });
    }
}
