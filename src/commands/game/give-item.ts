import { Command, CommandContext, Declare, Options, createIntegerOption, createStringOption, createUserOption } from "seyfert";
import { ITEM_DEFINITIONS, UserInventory } from "@/modules/inventory/items";
import { ensureUser, updateUser } from "@/db/repositories/users";

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
    
    const userData = await ensureUser(user.id);
    let inventory: UserInventory = userData.inventory 
    
    const currentItem = inventory[item] || { id: item, quantity: 0 };
    currentItem.quantity += quantity;
    inventory[item] = currentItem;

    await updateUser(user.id, { inventory });

    const itemDef = ITEM_DEFINITIONS[item];

    await ctx.write({
      content: `Se han añadido **${quantity}x ${itemDef.name}** al inventario de ${user.toString()}.`,
    });
  }
}
