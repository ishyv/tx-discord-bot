import { Command, Declare, Embed, type CommandContext } from "seyfert";
import {
  getItemDefinition,
  loadInventory,
  type InventoryItem,
} from "@/modules/inventory/items";
import { BindDisabled, Features } from "@/modules/features";
import { startPagination } from "@/modules/prefabs/pagination";

const ITEMS_PER_PAGE = 6;

@Declare({
  name: "inventory",
  description: "Muestra los articulos que tienes en tu inventario.",
})
@BindDisabled(Features.Economy)
export default class InventoryCommand extends Command {
  async run(ctx: CommandContext) {
    const inventory = await loadInventory(ctx.author.id);
    const items = Object.values(inventory).filter(
      (entry): entry is InventoryItem =>
        !!entry && typeof entry.id === "string" && typeof entry.quantity === "number" && entry.quantity > 0,
    );

if (items.length === 0) {
      await ctx.write({ content: "Tu inventario esta vacio." });
      return;
    }

    const resolved = items
      .map((item) => ({ item, def: getItemDefinition(item.id) }))
      .sort((a, b) => (a.def?.name ?? a.item.id).localeCompare(b.def?.name ?? b.item.id));

    const totalPages = Math.max(1, Math.ceil(resolved.length / ITEMS_PER_PAGE));

    await startPagination({
      totalPages,
      ownerId: ctx.author.id,
      sender: (msg) => ctx.editOrReply(msg),
      buildPage: (page) => {
        const start = page * ITEMS_PER_PAGE;
        const pageItems = resolved.slice(start, start + ITEMS_PER_PAGE);

        const lines = pageItems.map(({ item, def }) => {
          const label = def ? `${def.emoji ? `${def.emoji} ` : ""}${def.name}` : item.id;
          const description = def?.description ? ` - ${def.description}` : "";
          return `- ${label} x${item.quantity}${description}`;
        });

        const embed = new Embed()
          .setTitle("Tu inventario")
          .setDescription(lines.join("\n"))
          .setFooter({ text: `Pagina ${page + 1} / ${totalPages}` });

        return { embeds: [embed] };
      },
    });
  }
}
