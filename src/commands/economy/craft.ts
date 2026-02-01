/**
 * Craft Command.
 *
 * Purpose: List available recipes and craft items.
 */
import {
  Command,
  Declare,
  Options,
  type GuildCommandContext,
  createStringOption,
  createIntegerOption,
  Embed,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { EmbedColors } from "seyfert/lib/common";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
  craftingService,
  economyAccountRepo,
  createEconomyAccountService,
  guildEconomyRepo,
} from "@/modules/economy";
import { getItemDefinition } from "@/modules/inventory";
import type { CraftingRecipeView } from "@/modules/economy/crafting";

const craftOptions = {
  recipe: createStringOption({
    description: "ID de la receta a craftear",
    required: false,
  }),
  quantity: createIntegerOption({
    description: "Cantidad a craftear (default: 1)",
    required: false,
    min_value: 1,
    max_value: 100,
  }),
};

@Declare({
  name: "craft",
  description: "Craftear items usando recetas",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 3000,
  uses: { default: 1 },
})
@Options(craftOptions)
export default class CraftCommand extends Command {
  async run(ctx: GuildCommandContext<typeof craftOptions>) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;
    const recipeId = ctx.options.recipe;
    const quantity = ctx.options.quantity ?? 1;

    if (!guildId) {
      await ctx.write({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check feature flag
    const guildConfigResult = await guildEconomyRepo.ensure(guildId);
    if (
      guildConfigResult.isOk() &&
      !guildConfigResult.unwrap().features.crafting
    ) {
      await ctx.write({
        content: "🚫 Crafting está deshabilitado en este servidor.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const accountService = createEconomyAccountService(economyAccountRepo);
    const ensureResult = await accountService.ensureAccount(userId);
    if (ensureResult.isErr()) {
      await ctx.write({
        content: "Could not load your account.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { account } = ensureResult.unwrap();
    if (account.status !== "ok") {
      await ctx.write({
        content: "Your account has restrictions.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (recipeId) {
      await this.showCraftConfirmation(
        ctx,
        guildId,
        userId,
        recipeId,
        quantity,
      );
    } else {
      await this.showRecipeList(ctx, guildId, userId);
    }
  }

  private async showRecipeList(
    ctx: GuildCommandContext,
    guildId: string,
    userId: string,
  ) {
    const recipesResult = await craftingService.getRecipes(guildId, userId);

    if (recipesResult.isErr()) {
      await ctx.write({
        content: "Could not load crafting recipes.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const recipes = recipesResult.unwrap();

    if (recipes.length === 0) {
      await ctx.write({
        content: "No hay recetas disponibles en este servidor.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = new Embed()
      .setColor(EmbedColors.Blue)
      .setTitle("🔨 Recetas de Crafteo")
      .setDescription("Usa `/craft <recipeId>` para craftear un item.");

    // Group by canCraft
    const canCraft = recipes.filter((r: CraftingRecipeView) => r.canCraft);
    const cannotCraft = recipes.filter((r: CraftingRecipeView) => !r.canCraft);

    for (const recipe of [
      ...canCraft.slice(0, 5),
      ...cannotCraft.slice(0, 3),
    ]) {
      const status = recipe.canCraft ? "✅" : "❌";
      const inputsText = recipe.itemInputs
        .map(
          (i) =>
            `${getItemDefinition(i.itemId)?.name ?? i.itemId} x${i.quantity}`,
        )
        .join(", ");
      const outputsText = recipe.itemOutputs
        .map(
          (o) =>
            `${getItemDefinition(o.itemId)?.name ?? o.itemId} x${o.quantity}`,
        )
        .join(", ");

      const levelReq = recipe.requiredLevel
        ? ` (Nv ${recipe.requiredLevel}+)`
        : "";

      embed.addFields({
        name: `${status} ${recipe.name}${levelReq}`,
        value: `${recipe.description}\n📥 ${inputsText}\n📤 ${outputsText}${recipe.xpReward ? `\n⭐ +${recipe.xpReward} XP` : ""}`,
        inline: false,
      });
    }

    if (recipes.length > 8) {
      embed.setFooter({ text: `Y ${recipes.length - 8} recetas más...` });
    }

    await ctx.write({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  private async showCraftConfirmation(
    ctx: GuildCommandContext,
    guildId: string,
    userId: string,
    recipeId: string,
    quantity: number,
  ) {
    const recipeResult = await craftingService.getRecipe(
      guildId,
      userId,
      recipeId,
    );

    if (recipeResult.isErr() || !recipeResult.unwrap()) {
      await ctx.write({
        content: "❌ Receta no encontrada.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const recipe = recipeResult.unwrap()!;

    const inputsText = recipe.itemInputs
      .map((i) => {
        const itemName = getItemDefinition(i.itemId)?.name ?? i.itemId;
        const needed = i.quantity * quantity;
        return `• ${itemName} x${needed}`;
      })
      .join("\n");

    const outputsText = recipe.itemOutputs
      .map((o) => {
        const itemName = getItemDefinition(o.itemId)?.name ?? o.itemId;
        const produced = o.quantity * quantity;
        return `• ${itemName} x${produced}`;
      })
      .join("\n");

    const currencyText = recipe.currencyInput
      ? `\n💰 ${recipe.currencyInput.amount * quantity} ${recipe.currencyInput.currencyId}`
      : "";

    const feeText = recipe.guildFee
      ? `\n🏦 Fee: ${recipe.guildFee.amount * quantity} ${recipe.guildFee.currencyId} → ${recipe.guildFee.sector}`
      : "";

    const levelReq = recipe.requiredLevel
      ? `\n📈 Requiere Nivel ${recipe.requiredLevel}`
      : "";

    const xpText = recipe.xpReward
      ? `\n⭐ +${recipe.xpReward * quantity} XP`
      : "";

    const canCraft = recipe.canCraft;
    const statusEmoji = canCraft ? "✅" : "❌";

    let missingText = "";
    if (!canCraft) {
      if (recipe.missingItems.length > 0) {
        const missingItems = recipe.missingItems
          .map(
            (m) =>
              `${getItemDefinition(m.itemId)?.name ?? m.itemId} x${m.quantity}`,
          )
          .join(", ");
        missingText = `\n\n❌ **Faltan:** ${missingItems}`;
      }
      if (recipe.missingCurrency) {
        missingText += `\n❌ **Falta:** ${recipe.missingCurrency} ${recipe.currencyInput?.currencyId}`;
      }
    }

    const embed = new Embed()
      .setColor(canCraft ? EmbedColors.Green : EmbedColors.Red)
      .setTitle(`${statusEmoji} ${recipe.name}`)
      .setDescription(
        `${recipe.description}\n\n` +
          `**Cantidad:** ${quantity}\n\n` +
          `**Materiales necesarios:**\n${inputsText}${currencyText}${feeText}${levelReq}${xpText}\n\n` +
          `**Producirá:**\n${outputsText}` +
          missingText,
      );

    await ctx.write({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}
