import { Command, CommandContext, Declare, Options, createIntegerOption, createStringOption, createUserOption } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { ITEM_DEFINITIONS, itemTransaction } from "@/modules/inventory";
import { GuildLogger } from "@/utils/guildLogger";

const itemChoices = Object.values(ITEM_DEFINITIONS).map((item) => ({
    name: item.name,
    value: item.id,
}));

const options = {
    item: createStringOption({
        description: "El item a retirar",
        required: true,
        choices: itemChoices,
    }),
    quantity: createIntegerOption({
        description: "Cantidad de items a retirar",
        required: true,
        min_value: 1,
    }),
    user: createUserOption({
        description: "El usuario a quien retirar el item",
        required: true,
    }),
    reason: createStringOption({
        description: "Razón del retiro",
        required: false,
    }),
};

@Declare({
    name: "remove-item",
    description: "Retirar un item a un usuario (permite deuda)",
    defaultMemberPermissions: ["ManageGuild"],
})
@Options(options)
export default class RemoveItemCommand extends Command {
    async run(ctx: CommandContext<typeof options>) {
        const { item, quantity, user, reason } = ctx.options;

        // Use costs to remove items
        // allowDebt: true allows removal even if user doesn't have enough
        const result = await itemTransaction(user.id, {
            costs: [{ itemId: item, quantity }],
            allowDebt: true,
        });

        if (result.isErr()) {
            await ctx.write({
                content: `Error al retirar item: ${result.error.message}`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const itemDef = ITEM_DEFINITIONS[item];

        await ctx.write({
            content: `Se han retirado **${quantity}x ${itemDef.name}** del inventario de ${user.toString()}.`,
        });

        const logger = new GuildLogger();
        await logger.init(ctx.client, ctx.guildId);
        await logger.generalLog({
            title: "Item retirado",
            description: `El staff ${ctx.author.toString()} ha retirado un item a ${user.toString()}.`,
            fields: [
                { name: "Item", value: itemDef.name, inline: true },
                { name: "Cantidad", value: `${quantity}`, inline: true },
                { name: "Razón", value: reason ?? "No especificada", inline: false },
            ],
            color: "Red",
        });
    }
}
