/**
 * Economy Config Set Tax Sector Subcommand.
 *
 * Purpose: Admin-only set which sector receives tax deposits (global|works|trade|tax).
 * Audited as CONFIG_UPDATE.
 */

import {
  Declare,
  Options,
  SubCommand,
  createStringOption,
  type GuildCommandContext,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { checkEconomyPermission } from "@/modules/economy/permissions";
import { guildEconomyRepo, economyAuditRepo } from "@/modules/economy";
import type { EconomySector } from "@/modules/economy";

const SECTOR_CHOICES: { name: string; value: EconomySector }[] = [
  { name: "Global", value: "global" },
  { name: "Works", value: "works" },
  { name: "Trade", value: "trade" },
  { name: "Tax", value: "tax" },
];

const options = {
  sector: createStringOption({
    description: "Sector where tax is deposited",
    required: true,
    choices: SECTOR_CHOICES,
  }),
};

@Declare({
  name: "tax-sector",
  description: "Set sector for tax deposits (admin only)",
})
@Options(options)
export default class EconomyConfigSetTaxSectorCommand extends SubCommand {
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

    const sector = ctx.options.sector as EconomySector;
    const validSectors: EconomySector[] = ["global", "works", "trade", "tax"];
    if (!validSectors.includes(sector)) {
      await ctx.write({
        content: "Invalid sector. Use one of: global, works, trade, tax.",
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
      taxSector: sector,
    });
    if (updateResult.isErr()) {
      await ctx.write({
        content: "Failed to update tax sector.",
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
      source: "economy-config set tax-sector",
      metadata: {
        correlationId,
        key: "tax.taxSector",
        before: { taxSector: before.tax.taxSector },
        after: { taxSector: after.tax.taxSector },
      },
    });

    await ctx.write({
      content: `Tax deposit sector updated from **${before.tax.taxSector}** to **${after.tax.taxSector}**.`,
    });
  }
}
