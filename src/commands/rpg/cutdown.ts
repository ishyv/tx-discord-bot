/**
 * Cut Down Command.
 *
 * Purpose: Gather wood from forests using equipped axe.
 * Context: RPG gathering system - woodcutting tier 1-4 locations.
 */

import {
  Command,
  Declare,
  Options,
  createStringOption,
  type GuildCommandContext,
} from "seyfert";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { rpgGatheringService } from "@/modules/rpg/gathering/service";
import { rpgProfileService } from "@/modules/rpg/profile/service";
import { getLocation, listLocations } from "@/modules/rpg/gathering/definitions";
import { getItemDefinition } from "@/modules/inventory/items";

const locationChoices = listLocations("forest")
  .map((l) => ({
    name: `${l.name} (Tier ${l.requiredTier})`,
    value: l.id,
  }));

const options = {
  location: createStringOption({
    description: "Forest location",
    required: true,
    choices: locationChoices,
  }),
};

@Declare({
  name: "cutdown",
  description: "Cut down trees using your equipped axe",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 60000,
  uses: { default: 1 },
})
@Options(options)
export default class CutDownCommand extends Command {
  async run(ctx: GuildCommandContext<typeof options>) {
    const { location: locationId } = ctx.options;
    const userId = ctx.author.id;
    const guildId = ctx.guildId ?? undefined;

    // Economy gating - if this succeeds, user can use RPG
    const gateResult = await rpgProfileService.ensureAndGate(userId, guildId);
    if (gateResult.isErr()) {
      await ctx.write({
        content: `❌ ${gateResult.error.message}`,
        flags: 64,
      });
      return;
    }

    // Defer reply since this may take time
    await ctx.deferReply();

    const result = await rpgGatheringService.cutdown(
      userId,
      locationId,
      userId,
      guildId,
    );

    if (result.isErr()) {
      const error = result.error;
      let message = "❌ ";

      switch (error.code) {
        case "PROFILE_NOT_FOUND":
          message += "You need an RPG profile first! Use `/rpg profile` to create one.";
          break;
        case "NO_TOOL_EQUIPPED":
          message += "You need to equip an axe first! Use `/rpg equip weapon:axe`";
          break;
        case "INVALID_EQUIPMENT_SLOT":
          message += "You need to equip an axe, not a pickaxe! Use `/rpg equip weapon:axe`";
          break;
        case "INSUFFICIENT_TOOL_TIER":
          message += error.message;
          break;
        case "LOCATION_NOT_FOUND":
          message += "That forest location doesn't exist!";
          break;
        case "TOOL_BROKEN":
          message += "Your axe broke! You'll need to equip a new one.";
          break;
        default:
          message += error.message;
      }

      await ctx.editOrReply({
        content: message,
      });
      return;
    }

    const gather = result.unwrap();
    const location = getLocation(locationId)!;
    const materialName =
      getItemDefinition(gather.materialsGained[0]!.id)?.name ??
      gather.materialsGained[0]!.id;

    // Build response
    let response = `🪓 **Cutting at ${location.name}**\n\n`;

    // Yield
    const qty = gather.materialsGained[0]!.quantity;
    response += `🪵 Harvested: **${qty}x ${materialName}**\n`;

    // Tool status
    if (gather.toolBroken) {
      response += `\n💔 Your axe **broke**!`;
    } else {
      const durabilityBar = this.renderDurabilityBar(gather.remainingDurability);
      response += `\n🪓 Axe durability: ${durabilityBar} (${gather.remainingDurability} left)`;
    }

    await ctx.editOrReply({ content: response });
  }

  private renderDurabilityBar(durability: number): string {
    const maxDurability = 10; // Approximate for display
    const filled = Math.max(0, Math.min(10, Math.ceil((durability / maxDurability) * 10)));
    const empty = 10 - filled;
    return "█".repeat(filled) + "░".repeat(empty);
  }
}
