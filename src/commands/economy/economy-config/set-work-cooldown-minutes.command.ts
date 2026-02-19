/**
 * Set Work Cooldown Minutes Command.
 *
 * Purpose: Admin command to set cooldown for /work.
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
  minutes: createIntegerOption({
    description: "Cooldown minutes between /work claims (>= 0)",
    required: true,
    min_value: 0,
    max_value: 1440,
  }),
};

@HelpDoc({
  command: "economy-config set-work-cooldown-minutes",
  category: HelpCategory.Economy,
  description: "Set the cooldown duration for /work in minutes (admin only)",
  usage: "/economy-config set-work-cooldown-minutes <minutes>",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "set-work-cooldown-minutes",
  description: "Set cooldown for /work in minutes (admin only)",
})
@Options(options)
export default class EconomyConfigSetWorkCooldownMinutesCommand extends SubCommand {
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
        content: "You need admin permission to set work cooldown.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const minutes = Number(ctx.options.minutes);
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
      workCooldownMinutes: minutes,
    });
    if (updateResult.isErr()) {
      await ctx.write({
        content: "Failed to update work cooldown.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await economyAuditRepo.create({
      operationType: "config_update",
      guildId,
      actorId: ctx.author.id,
      targetId: ctx.author.id,
      source: "set-work-cooldown-minutes",
      reason: "Set work cooldown",
      metadata: {
        field: "workCooldownMinutes",
        before: before.work.workCooldownMinutes,
        after: minutes,
        correlationId: ctx.interaction.id,
      },
    });

    await ctx.write({
      content: `Work cooldown set to **${minutes} minutes**.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
