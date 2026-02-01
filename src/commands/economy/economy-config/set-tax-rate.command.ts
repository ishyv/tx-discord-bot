/**
 * Economy Config Set Tax Rate Subcommand.
 *
 * Purpose: Admin-only set guild tax rate (0..0.5).
 * Audited as CONFIG_UPDATE with before/after and correlationId.
 */

import {
  Declare,
  Options,
  SubCommand,
  createNumberOption,
  type GuildCommandContext,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { checkEconomyPermission } from "@/modules/economy/permissions";
import { guildEconomyRepo, economyAuditRepo } from "@/modules/economy";

const TAX_RATE_MIN = 0;
const TAX_RATE_MAX = 0.5;

const options = {
  rate: createNumberOption({
    description: `Tax rate (${TAX_RATE_MIN} to ${TAX_RATE_MAX}, e.g. 0.05 = 5%)`,
    required: true,
    min_value: TAX_RATE_MIN,
    max_value: TAX_RATE_MAX,
  }),
};

@Declare({
  name: "tax-rate",
  description: "Set guild tax rate (admin only)",
})
@Options(options)
export default class EconomyConfigSetTaxRateCommand extends SubCommand {
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
    const hasAdmin = await checkEconomyPermission(
      ctx.member,
      EconomyPermissionLevel.ADMIN,
    );
    if (!hasAdmin) {
      await ctx.write({
        content: "You need admin permission to change economy config.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const rawRate = ctx.options.rate;
    const rate = Math.max(
      TAX_RATE_MIN,
      Math.min(TAX_RATE_MAX, Number(rawRate)),
    );
    if (!Number.isFinite(rate)) {
      await ctx.write({
        content: "Invalid tax rate. Use a number between 0 and 0.5.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const beforeResult = await guildEconomyRepo.ensure(guildId);
    if (beforeResult.isErr()) {
      await ctx.write({
        content: "Failed to load current config.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const before = beforeResult.unwrap();

    const updateResult = await guildEconomyRepo.updateTaxConfig(guildId, {
      rate,
    });
    if (updateResult.isErr()) {
      await ctx.write({
        content: "Failed to update tax rate.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const after = updateResult.unwrap();

    const correlationId = `config_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await economyAuditRepo.create({
      operationType: "config_update",
      actorId: ctx.author.id,
      targetId: guildId,
      guildId,
      source: "economy-config set tax-rate",
      metadata: {
        correlationId,
        key: "tax.rate",
        before: { rate: before.tax.rate },
        after: { rate: after.tax.rate },
      },
    });

    await ctx.write({
      content: `Tax rate updated from **${(before.tax.rate * 100).toFixed(1)}%** to **${(after.tax.rate * 100).toFixed(1)}%**.`,
    });
  }
}
