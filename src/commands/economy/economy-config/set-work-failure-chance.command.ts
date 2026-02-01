/**
 * Set Work Failure Chance Command.
 *
 * Purpose: Admin command to set failure chance for /work payouts.
 * Audited as config_update with before/after and correlationId.
 */
import {
  Declare,
  Options,
  SubCommand,
  type GuildCommandContext,
  createNumberOption,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { checkEconomyPermission } from "@/modules/economy/permissions";
import { guildEconomyRepo, economyAuditRepo } from "@/modules/economy";

const options = {
  chance: createNumberOption({
    description: "Failure chance percentage (0-100)",
    required: true,
    min_value: 0,
    max_value: 100,
  }),
};

@Declare({
  name: "set-work-failure-chance",
  description: "Set failure chance for /work (admin only)",
})
@Options(options)
export default class EconomyConfigSetWorkFailureChanceCommand extends SubCommand {
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
        content: "You need admin permission to set work failure chance.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const chance = Math.max(0, Math.min(100, Number(ctx.options.chance)));
    const failureChance = chance / 100;

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
      workFailureChance: failureChance,
    });
    if (updateResult.isErr()) {
      await ctx.write({
        content: "Failed to update work failure chance.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await economyAuditRepo.create({
      operationType: "config_update",
      guildId,
      actorId: ctx.author.id,
      targetId: ctx.author.id,
      source: "set-work-failure-chance",
      reason: "Set work failure chance",
      metadata: {
        field: "workFailureChance",
        before: before.work.workFailureChance ?? 0,
        after: failureChance,
        correlationId: ctx.interaction.id,
      },
    });

    await ctx.write({
      content: `Work failure chance set to **${chance.toFixed(1)}%**.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
