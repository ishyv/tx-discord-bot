/**
 * Trinkets Loadout Command.
 *
 * Purpose: Show your equipped trinkets, rings, and necklaces with boon stats.
 */
import { Command, Declare, type GuildCommandContext, Embed } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { EmbedColors } from "seyfert/lib/common";
import { BindDisabled, Features } from "@/modules/features";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
  equipmentService,
  getSlotDisplayName,
  EQUIPMENT_SLOTS,
  economyAccountService,
} from "@/modules/economy";
@HelpDoc({
  command: "trinkets-loadout",
  category: HelpCategory.Economy,
  description: "View your currently equipped trinkets and their passive boon stats",
  usage: "/trinkets-loadout",
})
@Declare({
  name: "trinkets-loadout",
  description: "🔮 View your equipped trinkets and their boons",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 3000,
  uses: { default: 1 },
})
export default class TrinketsLoadoutCommand extends Command {
  async run(ctx: GuildCommandContext) {
    const { guildId } = ctx;
    const userId = ctx.author.id;
    const username = ctx.author.username;
    const avatarURL = ctx.author.avatarURL();

    if (!guildId) {
      await ctx.write({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const accountService = economyAccountService;
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

    const [equippedResult, statsResult] = await Promise.all([
      equipmentService.getEquippedItems(guildId, userId),
      equipmentService.getStatsSummary(guildId, userId),
    ]);

    if (equippedResult.isErr() || statsResult.isErr()) {
      await ctx.write({
        content: "Could not load your loadout.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const equipped = equippedResult.unwrap();
    const stats = statsResult.unwrap();

    const embed = new Embed()
      .setColor(EmbedColors.Gold)
      .setTitle("🔮 Your Trinkets & Boons")
      .setAuthor({
        name: username,
        iconUrl: avatarURL,
      });

    // Show all slots
    for (const slot of EQUIPMENT_SLOTS) {
      const item = equipped.find((e) => e.slot === slot);
      const slotName = getSlotDisplayName(slot);

      if (item) {
        const statsText = Object.entries(item.stats)
          .filter(([, v]) => v !== undefined && v !== 0)
          .map(([k, v]) => {
            const valueText =
              typeof v === "number" && v < 1 && v > 0
                ? `+${(v * 100).toFixed(0)}%`
                : `+${v}`;
              switch (k) {
                case "luck":
                  return `${valueText} luck`;
                case "workBonusPct":
                  return `${valueText} work`;
                case "shopDiscountPct":
                  return `${valueText} discount`;
                case "weightCap":
                  return `${valueText} weight`;
                case "slotCap":
                  return `${valueText} slots`;
                case "dailyBonusCap":
                  return `${valueText} streak`;
                default:
                  return "";
              }
          })
          .filter(Boolean)
          .join(", ");

        embed.addFields({
          name: slotName,
          value: `${item.emoji} **${item.name}**\n📊 ${statsText || "No stats"}`,
          inline: true,
        });
      } else {
        embed.addFields({
          name: slotName,
          value: "*Empty*",
          inline: true,
        });
      }
    }

    // Stats summary
      const totalStatsText = [
        stats.luck > 0 ? `🍀 Luck: +${stats.luck}` : "",
        stats.workBonusPct > 0
          ? `🛠️ Work: +${(stats.workBonusPct * 100).toFixed(0)}%`
          : "",
        stats.shopDiscountPct > 0
          ? `🏷️ Discount: ${(stats.shopDiscountPct * 100).toFixed(0)}%`
          : "",
        stats.dailyBonusCap > 0 ? `📅 Streak: +${stats.dailyBonusCap}` : "",
        stats.weightCap > 0 ? `⚖️ Weight: +${stats.weightCap}` : "",
        stats.slotCap > 0 ? `📦 Slots: +${stats.slotCap}` : "",
      ]
      .filter(Boolean)
      .join("\n");

    if (totalStatsText) {
        embed.addFields({
          name: "📊 Total Stats",
          value: totalStatsText,
          inline: false,
        });
    }

    const equippedCount = equipped.length;
    embed.setFooter({ text: `${equippedCount}/6 trinket slots occupied` });

    await ctx.write({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}
