/**
 * Economy Sectors Command.
 *
 * Purpose: Show sector balances (global, works, trade, tax) and last updated.
 * Permission: mod or admin.
 */

import { Command, Declare, Embed, type CommandContext } from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import { MessageFlags } from "seyfert/lib/types";
import { checkEconomyPermission } from "@/modules/economy/permissions";
import { guildEconomyService } from "@/modules/economy";

@Declare({
  name: "economy-sectors",
  description: "Show guild economy sector balances (global, works, trade, tax)",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageGuild"],
})
export default class EconomySectorsCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { EconomyPermissionLevel } = await import(
      "@/modules/economy/permissions"
    );
    const hasMod = await checkEconomyPermission(
      ctx.member,
      EconomyPermissionLevel.MOD,
    );
    if (!hasMod) {
      await ctx.write({
        content: "You need mod or admin permission to view economy sectors.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const result = await guildEconomyService.getAllSectorBalances(guildId);
    if (result.isErr()) {
      await ctx.write({
        content: "Failed to load sector balances.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const configResult = await guildEconomyService.getConfig(guildId);
    const updatedAt = configResult.isOk()
      ? configResult.unwrap().updatedAt.toISOString().slice(0, 16)
      : "—";

    const sectors = result.unwrap();
    const lines = (["global", "works", "trade", "tax"] as const).map(
      (s) => `**${s}**: ${sectors[s].toLocaleString()}`,
    );

    const embed = new Embed()
      .setColor(EmbedColors.Blue)
      .setTitle("Economy sectors")
      .setDescription(lines.join("\n"))
      .addFields({
        name: "Last updated",
        value: updatedAt.replace("T", " "),
        inline: false,
      });

    await ctx.write({ embeds: [embed] });
  }
}
