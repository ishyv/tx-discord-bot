/**
 * Set Daily Fee Rate Command
 *
 * Purpose: Admin command to set the daily claim fee rate (0..0.20).
 * Audited as config_update with before/after and correlationId.
 */
import {
  Declare,
  Options,
  SubCommand,
  type GuildCommandContext,
  createNumberOption,
} from "seyfert";
import { guildEconomyRepo } from "@/modules/economy";
import { MessageFlags } from "seyfert/lib/types";
import { checkEconomyPermission } from "@/modules/economy/permissions";
import { guildEconomyService, economyAuditRepo } from "@/modules/economy";

const options = {
  rate: createNumberOption({
    description: "Fee rate as a percentage (0-20)",
    required: true,
    min_value: 0,
    max_value: 20,
  }),
};

@Declare({
  name: "set-daily-fee-rate",
  description: "Set the daily claim fee rate (0-20%)",
})
@Options(options)
export default class SetDailyFeeRateCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
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
    const isAdmin = await checkEconomyPermission(
      ctx.member,
      EconomyPermissionLevel.ADMIN,
    );
    if (!isAdmin) {
      await ctx.write({
        content: "You need admin permission to set the daily fee rate.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const rate = ctx.options.rate;
    const feeRate = Math.max(0, Math.min(0.2, Number(rate) / 100));
    const configResult = await guildEconomyService.getConfig(guildId);
    if (configResult.isErr()) {
      await ctx.write({
        content: "Failed to load economy config.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const config = configResult.unwrap();
    const before = { ...config.daily };
    const after = { ...config.daily, dailyFeeRate: feeRate };
    const updateResult = await guildEconomyRepo.updateDailyConfig(
      guildId,
      after,
    );
    if (updateResult.isErr()) {
      await ctx.write({
        content: "Failed to update daily fee rate.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    // Audit
    await economyAuditRepo.create({
      operationType: "config_update",
      guildId,
      actorId: ctx.author.id,
      targetId: ctx.author.id,
      source: "set-daily-fee-rate",
      reason: "Set daily fee rate",
      metadata: {
        field: "dailyFeeRate",
        before: before.dailyFeeRate ?? 0,
        after: feeRate,
        correlationId: ctx.interaction.id,
      },
    });
    await ctx.write({
      content: `Daily claim fee rate set to **${(feeRate * 100).toFixed(2)}%**.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
