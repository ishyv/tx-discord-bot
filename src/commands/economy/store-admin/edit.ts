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
import { buildSuccessEmbed, buildErrorEmbed } from "@/modules/ui/design-system";
import { storeService, economyAuditRepo } from "@/modules/economy";
import { checkEconomyPermission, EconomyPermissionLevel } from "@/modules/economy/permissions";

const options = {
    item: createStringOption({
        description: "Item ID to edit (e.g., iron_ore, copper_ingot)",
        required: true,
    }),
    name: createStringOption({
        description: "New display name",
        required: false,
    }),
    buy_price: createIntegerOption({
        description: "New buy price",
        required: false,
        min_value: 1,
    }),
    sell_price: createIntegerOption({
        description: "New sell price",
        required: false,
        min_value: 1,
    }),
    stock: createIntegerOption({
        description: "New stock amount (-1 for unlimited)",
        required: false,
    }),
    category: createStringOption({
        description: "New category",
        required: false,
    }),
    available: createBooleanOption({
        description: "Toggle availability",
        required: false,
    }),
};

@Declare({
    name: "edit",
    description: "Edit an existing store item",
})
@Options(options)
export default class StoreAdminEditCommand extends SubCommand {
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

        const { item: itemId, name, buy_price, sell_price, stock, category, available } = ctx.options;

        const update: any = {};
        if (name !== undefined) update.name = name;
        if (buy_price !== undefined) update.buyPrice = buy_price;
        if (sell_price !== undefined) update.sellPrice = sell_price;
        if (stock !== undefined) update.stock = stock;
        if (category !== undefined) update.category = category;
        if (available !== undefined) update.available = available;

        const result = await storeService.editItem(guildId, itemId, update);

        if (result.isErr()) {
            return ctx.write({
                embeds: [buildErrorEmbed({ message: `Failed to edit item: ${result.error.message}` })],
                flags: MessageFlags.Ephemeral,
            });
        }

        await economyAuditRepo.create({
            operationType: "config_update",
            actorId: ctx.author.id,
            targetId: guildId,
            guildId,
            source: "store-admin edit",
            metadata: {
                itemId,
                update,
            },
        });

        return ctx.write({
            embeds: [buildSuccessEmbed({ title: "Item Updated", description: `Updated **${itemId}** in the store!` })],
            flags: MessageFlags.Ephemeral,
        });
    }
}
