/**
 * Set Work Daily Cap Command.
 *
 * Purpose: Admin command to set daily cap for /work.
 * Audited as config_update with before/after and correlationId.
 */
import {
  Declare,
  Options,
  SubCommand,
  type GuildCommandContext,
  createIntegerOption,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { checkEconomyPermission } from "@/modules/economy/permissions";
import { guildEconomyRepo, economyAuditRepo } from "@/modules/economy";

const options = {
  cap: createIntegerOption({
    description: "Daily work claim cap (0-100)",
    required: true,
    min_value: 0,
    max_value: 100,
  }),
};

@Declare({
  name: "set-work-daily-cap",
  description: "Set daily cap for /work (admin only)",
})
@Options(options)
export default class EconomyConfigSetWorkDailyCapCommand extends SubCommand {
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
        content: "You need admin permission to set work daily cap.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const cap = Number(ctx.options.cap);
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
      workDailyCap: cap,
    });
    if (updateResult.isErr()) {
      await ctx.write({
        content: "Failed to update work daily cap.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await economyAuditRepo.create({
      operationType: "config_update",
      guildId,
      actorId: ctx.author.id,
      targetId: ctx.author.id,
      source: "set-work-daily-cap",
      reason: "Set work daily cap",
      metadata: {
        field: "workDailyCap",
        before: before.work.workDailyCap,
        after: cap,
        correlationId: ctx.interaction.id,
      },
    });

    await ctx.write({
      content: `Work daily cap set to **${cap}**.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
