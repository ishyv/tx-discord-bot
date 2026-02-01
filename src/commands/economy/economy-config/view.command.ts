/**
 * Economy Config View Subcommand.
 *
 * Purpose: Show guild tax rate, deposit sector, thresholds, store config, capacity defaults (if any).
 * Permission: mod or admin.
 */

import {
  Declare,
  Embed,
  Options,
  SubCommand,
  type GuildCommandContext,
} from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import { MessageFlags } from "seyfert/lib/types";
import { checkEconomyPermission } from "@/modules/economy/permissions";
import { guildEconomyService, storeRepo } from "@/modules/economy";

@Declare({
  name: "view",
  description:
    "Show current guild economy config (tax, sectors, thresholds, store)",
})
@Options({})
export default class EconomyConfigViewCommand extends SubCommand {
  async run(ctx: GuildCommandContext<Record<string, never>>) {
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
        content: "You need mod or admin permission to view economy config.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const configResult = await guildEconomyService.getConfig(guildId);
    if (configResult.isErr()) {
      await ctx.write({
        content: "Failed to load economy config.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const config = configResult.unwrap();
    const storeResult = await storeRepo.ensure(guildId);
    const storeCatalog = storeResult.isOk() ? storeResult.unwrap() : null;

    const tax = config.tax;
    const taxPct = (tax.rate * 100).toFixed(1);
    const sectorList = ["global", "works", "trade", "tax"]
      .map(
        (s) =>
          `${s}: **${config.sectors[s as keyof typeof config.sectors].toLocaleString()}**`,
      )
      .join("\n");

    const embed = new Embed()
      .setColor(EmbedColors.Blue)
      .setTitle("Economy config")
      .setDescription(
        `Guild economy settings (updated: ${config.updatedAt.toISOString().slice(0, 10)})`,
      )
      .addFields(
        {
          name: "Tax",
          value:
            `Rate: **${taxPct}%**\n` +
            `Enabled: **${tax.enabled ? "Yes" : "No"}**\n` +
            `Min taxable: **${tax.minimumTaxableAmount.toLocaleString()}**\n` +
            `Deposit sector: **${tax.taxSector}**`,
          inline: false,
        },
        {
          name: "Transfer thresholds",
          value:
            `Warning: **${config.thresholds.warning.toLocaleString()}**\n` +
            `Alert: **${config.thresholds.alert.toLocaleString()}**\n` +
            `Critical: **${config.thresholds.critical.toLocaleString()}**`,
          inline: false,
        },
        {
          name: "Sector balances",
          value: sectorList,
          inline: false,
        },
      );

    if (storeCatalog) {
      embed.addFields({
        name: "Store",
        value:
          `Tax rate: **${(storeCatalog.taxRate * 100).toFixed(1)}%**\n` +
          `Currency: **${storeCatalog.currencyId}**\n` +
          `Sell price: typically ~85% of buy (per item)`,
        inline: false,
      });
    }

    embed.addFields({
      name: "Daily reward",
      value:
        `Amount: **${config.daily.dailyReward}** ${config.daily.dailyCurrencyId}\n` +
        `Cooldown: **${config.daily.dailyCooldownHours}h**\n` +
        `Fee: **${((config.daily.dailyFeeRate ?? 0) * 100).toFixed(2)}%**\n` +
        `Streak bonus: **+${config.daily.dailyStreakBonus}** per day (cap ${config.daily.dailyStreakCap})` +
        (config.daily.dailyFeeRate && config.daily.dailyFeeRate > 0
          ? `\nFee sector: **${config.daily.dailyFeeSector ?? "tax"}**`
          : ""),
      inline: false,
    });

    embed.addFields({
      name: "Work reward (Hybrid model)",
      value:
        `Base Mint (Always): **${config.work.workBaseMintReward}** ${config.work.workCurrencyId}\n` +
        `Max Bonus (Treasury): **${config.work.workBonusFromWorksMax}** (${config.work.workBonusScaleMode === "percent" ? "Scaled" : "Flat"})\n` +
        `Cooldown: **${config.work.workCooldownMinutes}m**\n` +
        `Daily cap: **${config.work.workDailyCap}**\n` +
        `Pays from: **${config.work.workPaysFromSector}**\n` +
        `Failure chance: **${((config.work.workFailureChance ?? 0) * 100).toFixed(1)}%**`,
      inline: false,
    });

    embed.addFields({
      name: "XP progression",
      value:
        `Enabled: **${config.progression.enabled ? "Yes" : "No"}**\n` +
        `daily_claim: **${config.progression.xpAmounts.daily_claim} XP** (cd ${config.progression.cooldownSeconds.daily_claim}s)\n` +
        `work_claim: **${config.progression.xpAmounts.work_claim} XP** (cd ${config.progression.cooldownSeconds.work_claim}s)\n` +
        `store_buy: **${config.progression.xpAmounts.store_buy} XP** (cd ${config.progression.cooldownSeconds.store_buy}s)\n` +
        `store_sell: **${config.progression.xpAmounts.store_sell} XP** (cd ${config.progression.cooldownSeconds.store_sell}s)\n` +
        `quest_complete: **${config.progression.xpAmounts.quest_complete} XP** (cd ${config.progression.cooldownSeconds.quest_complete}s)`,
      inline: false,
    });

    // Feature flags
    const features = config.features;
    embed.addFields({
      name: "Feature flags",
      value:
        `coinflip: ${features.coinflip ? "✅" : "🚫"}  ` +
        `trivia: ${features.trivia ? "✅" : "🚫"}  ` +
        `rob: ${features.rob ? "✅" : "🚫"}\n` +
        `voting: ${features.voting ? "✅" : "🚫"}  ` +
        `crafting: ${features.crafting ? "✅" : "🚫"}  ` +
        `store: ${features.store ? "✅" : "🚫"}`,
      inline: false,
    });

    await ctx.write({ embeds: [embed] });
  }
}
