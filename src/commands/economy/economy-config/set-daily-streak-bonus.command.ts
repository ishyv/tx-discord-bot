/**
 * Set Daily Streak Bonus Command
 *
 * Purpose: Admin command to set the per-day streak bonus amount.
 * Audited as config_update with before/after and correlationId.
 */
import { HelpDoc, HelpCategory } from "@/modules/help";
import {
  createIntegerOption,
  Declare,
  type GuildCommandContext,
  Options,
  SubCommand,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import {
  economyAuditRepo,
  guildEconomyRepo,
  guildEconomyService,
} from "@/modules/economy";
import { checkEconomyPermission, EconomyPermissionLevel } from "@/modules/economy/permissions";

const options = {
  amount: createIntegerOption({
    description: "Bonus amount per streak day (0-1000)",
    required: true,
    min_value: 0,
    max_value: 1000,
  }),
};

@HelpDoc({
  command: "economy-config set-daily-streak-bonus",
  category: HelpCategory.Economy,
  description: "Set the bonus amount added per daily streak day (0–1000)",
  usage: "/economy-config set-daily-streak-bonus <amount>",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "set-daily-streak-bonus",
  description: "Set the daily streak bonus amount per day (0-1000)",
})
@Options(options)
export default class SetDailyStreakBonusCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const isAdmin = await checkEconomyPermission(
      ctx.member,
      EconomyPermissionLevel.ADMIN,
    );
    if (!isAdmin) {
      await ctx.write({
        content: "You need admin permission to set the daily streak bonus.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const amount = Math.max(0, Math.trunc(ctx.options.amount));
    const configResult = await guildEconomyService.getConfig(guildId);
    if (configResult.isErr()) {
      await ctx.write({
        content: "Failed to load economy config.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const config = configResult.unwrap();
    const before = config.daily.dailyStreakBonus ?? 0;
    const updateResult = await guildEconomyRepo.updateDailyConfig(guildId, {
      dailyStreakBonus: amount,
    });
    if (updateResult.isErr()) {
      await ctx.write({
        content: "Failed to update daily streak bonus.",
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
      source: "set-daily-streak-bonus",
      reason: "Set daily streak bonus",
      metadata: {
        field: "dailyStreakBonus",
        before,
        after: amount,
        correlationId: ctx.interaction.id,
      },
    });
    await ctx.write({
      content: `Daily streak bonus set to **+${amount}** per consecutive day.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
