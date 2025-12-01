import { BindDisabled, Features } from "@/modules/features";
import { Command, CommandContext, Declare } from "seyfert";

@Declare({
  name: "shop",
  description: "Muestra los artículos disponibles en la tienda.",
})
@BindDisabled(Features.Economy)
export default class ShopCommand extends Command {
  async run(_ctx: CommandContext) {
    // const shopItems = []
  }
}
