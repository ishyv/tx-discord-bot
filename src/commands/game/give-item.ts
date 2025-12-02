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
    description: "El item a dar",
    required: true,
    choices: itemChoices,
  }),
  quantity: createIntegerOption({
    description: "Cantidad de items",
    required: true,
    min_value: 1,
  }),
  user: createUserOption({
    description: "El usuario a quien dar el item",
    required: true,
  }),
};

@Declare({
  name: "give-item",
  description: "Dar un item a un usuario",
  defaultMemberPermissions: ["ManageGuild"],
})
@Options(options)
export default class GiveItemCommand extends Command {
  async run(ctx: CommandContext<typeof options>) {
    const { item, quantity, user } = ctx.options;

    const result = await itemTransaction(user.id, {
      rewards: [{ itemId: item, quantity }],
    });

    if (result.isErr()) {
      await ctx.write({
        content: `Error al entregar item: ${result.error.message}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const itemDef = ITEM_DEFINITIONS[item];

    await ctx.write({
      content: `Se han añadido **${quantity}x ${itemDef.name}** al inventario de ${user.toString()}.`,
    });

    const logger = new GuildLogger();
    await logger.init(ctx.client, ctx.guildId);
    await logger.generalLog({
      title: "Item entregado",
      description: `El staff ${ctx.author.toString()} ha entregado un item a ${user.toString()}.`,
      fields: [
        { name: "Item", value: itemDef.name, inline: true },
        { name: "Cantidad", value: `${quantity}`, inline: true },
      ],
      color: "Green",
    });
  }
}
