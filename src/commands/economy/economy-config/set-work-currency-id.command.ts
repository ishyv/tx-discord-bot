/**
 * Set Work Currency Command.
 *
 * Purpose: Admin command to set currency for /work payouts.
 * Audited as config_update with before/after and correlationId.
 */
import {
  Declare,
  Options,
  SubCommand,
  type GuildCommandContext,
  createStringOption,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { checkEconomyPermission } from "@/modules/economy/permissions";
import { guildEconomyRepo, economyAuditRepo } from "@/modules/economy";

const options = {
  currency_id: createStringOption({
    description: "Currency ID to pay out for /work (e.g. coins)",
    required: true,
  }),
};

@Declare({
  name: "set-work-currency-id",
  description: "Set currency for /work payouts (admin only)",
})
@Options(options)
export default class EconomyConfigSetWorkCurrencyIdCommand extends SubCommand {
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
        content: "You need admin permission to set work currency.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const currencyId = ctx.options.currency_id.trim();
    if (!currencyId) {
      await ctx.write({
        content: "Currency ID cannot be empty.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

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
      workCurrencyId: currencyId,
    });
    if (updateResult.isErr()) {
      await ctx.write({
        content: "Failed to update work currency.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await economyAuditRepo.create({
      operationType: "config_update",
      guildId,
      actorId: ctx.author.id,
      targetId: ctx.author.id,
      source: "set-work-currency-id",
      reason: "Set work currency",
      metadata: {
        field: "workCurrencyId",
        before: before.work.workCurrencyId,
        after: currencyId,
        correlationId: ctx.interaction.id,
      },
    });

    await ctx.write({
      content: `Work currency set to **${currencyId}**.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
