/**
 * Set Work Reward Base Command.
 *
 * Purpose: Admin command to set base payout for /work.
 * Audited as config_update with before/after and correlationId.
 */
import { HelpDoc, HelpCategory } from "@/modules/help";
import {
  Declare,
  Options,
  SubCommand,
  type GuildCommandContext,
  createIntegerOption,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { checkEconomyPermission, EconomyPermissionLevel } from "@/modules/economy/permissions";
import { guildEconomyRepo, economyAuditRepo } from "@/modules/economy";

const options = {
  amount: createIntegerOption({
    description: "Base payout amount for /work (>= 0)",
    required: true,
    min_value: 0,
  }),
};

@HelpDoc({
  command: "economy-config set-work-reward-base",
  category: HelpCategory.Economy,
  description: "Set the base payout amount for /work (admin only)",
  usage: "/economy-config set-work-reward-base <amount>",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "set-work-reward-base",
  description: "Set base payout for /work (admin only)",
})
@Options(options)
export default class EconomyConfigSetWorkRewardBaseCommand extends SubCommand {
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
        content: "You need admin permission to set work reward.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const amount = Number(ctx.options.amount);
    const configResult = await guildEconomyRepo.ensure(guildId);
    if (configResult.isErr()) {
      await ctx.write({
        content: "Failed to load economy config.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const before = configResult.unwrap();

    const updateResult = await guildEconomyRepo.updateWorkConfig(guildId, {
      workRewardBase: amount,
    });
    if (updateResult.isErr()) {
      await ctx.write({
        content: "Failed to update work reward base.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await economyAuditRepo.create({
      operationType: "config_update",
      guildId,
      actorId: ctx.author.id,
      targetId: ctx.author.id,
      source: "set-work-reward-base",
      reason: "Set work reward base",
      metadata: {
        field: "workRewardBase",
        before: before.work.workRewardBase,
        after: amount,
        correlationId: ctx.interaction.id,
      },
    });

    await ctx.write({
      content: `Work base reward set to **${amount}**.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
