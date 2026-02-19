/**
 * Set Daily Streak Cap Command
 *
 * Purpose: Admin command to set the maximum streak bonus cap.
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
  cap: createIntegerOption({
    description: "Maximum streak days for bonus calculation (1-365)",
    required: true,
    min_value: 1,
    max_value: 365,
  }),
};

@HelpDoc({
  command: "economy-config set-daily-streak-cap",
  category: HelpCategory.Economy,
  description: "Set the daily streak cap (maximum days counted for bonus calculation)",
  usage: "/economy-config set-daily-streak-cap <days>",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "set-daily-streak-cap",
  description: "Set the daily streak cap (max days for bonus calculation)",
})
@Options(options)
export default class SetDailyStreakCapCommand extends SubCommand {
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
        content: "You need admin permission to set the daily streak cap.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const cap = Math.max(1, Math.trunc(ctx.options.cap));
    const configResult = await guildEconomyService.getConfig(guildId);
    if (configResult.isErr()) {
      await ctx.write({
        content: "Failed to load economy config.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const config = configResult.unwrap();
    const before = config.daily.dailyStreakCap ?? 10;
    const updateResult = await guildEconomyRepo.updateDailyConfig(guildId, {
      dailyStreakCap: cap,
    });
    if (updateResult.isErr()) {
      await ctx.write({
        content: "Failed to update daily streak cap.",
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
      source: "set-daily-streak-cap",
      reason: "Set daily streak cap",
      metadata: {
        field: "dailyStreakCap",
        before,
        after: cap,
        correlationId: ctx.interaction.id,
      },
    });
    await ctx.write({
      content: `Daily streak cap set to **${cap}** days (max bonus: +${(config.daily.dailyStreakBonus ?? 5) * cap}).`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
