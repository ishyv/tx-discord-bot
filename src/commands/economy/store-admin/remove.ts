import {
    Declare,
    SubCommand,
    Options,
    CommandContext,
    createStringOption,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { buildSuccessEmbed, buildErrorEmbed } from "@/modules/ui/design-system";
import { ITEM_DEFINITIONS } from "@/modules/inventory";
import { storeService, economyAuditRepo } from "@/modules/economy";
import { checkEconomyPermission, EconomyPermissionLevel } from "@/modules/economy/permissions";

const options = {
    item: createStringOption({
        description: "Item to remove from store",
        required: true,
        choices: Object.values(ITEM_DEFINITIONS).map((item) => ({
            name: item.name,
            value: item.id,
        })),
    }),
};

@Declare({
    name: "remove",
    description: "Remove an item from the store",
})
@Options(options)
export default class StoreAdminRemoveCommand extends SubCommand {
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

        const { item: itemId } = ctx.options;

        const result = await storeService.removeItem(guildId, itemId);

        if (result.isErr()) {
            return ctx.write({
                embeds: [buildErrorEmbed({ message: `Failed to remove item: ${result.error.message}` })],
                flags: MessageFlags.Ephemeral,
            });
        }

        await economyAuditRepo.create({
            operationType: "config_update",
            actorId: ctx.author.id,
            targetId: guildId,
            guildId,
            source: "store-admin remove",
            metadata: {
                itemId,
            },
        });

        return ctx.write({
            embeds: [buildSuccessEmbed({ title: "Item Removed", description: `Removed **${itemId}** from the store!` })],
            flags: MessageFlags.Ephemeral,
        });
    }
}
