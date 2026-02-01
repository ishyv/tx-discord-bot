/**
 * Set Work Pays From Sector Command.
 *
 * Purpose: Admin command to set which guild sector funds /work payouts.
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
import type { EconomySector } from "@/modules/economy";

const SECTOR_CHOICES: { name: string; value: EconomySector }[] = [
  { name: "Global", value: "global" },
  { name: "Works", value: "works" },
  { name: "Trade", value: "trade" },
  { name: "Tax", value: "tax" },
];

const options = {
  sector: createStringOption({
    description: "Sector that pays /work rewards",
    required: true,
    choices: SECTOR_CHOICES,
  }),
};

@Declare({
  name: "set-work-pays-from-sector",
  description: "Set sector that pays /work rewards (admin only)",
})
@Options(options)
export default class EconomyConfigSetWorkPaysFromSectorCommand extends SubCommand {
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
        content: "You need admin permission to set work sector.",
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
      workPaysFromSector: sector,
    });
    if (updateResult.isErr()) {
      await ctx.write({
        content: "Failed to update work sector.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await economyAuditRepo.create({
      operationType: "config_update",
      guildId,
      actorId: ctx.author.id,
      targetId: ctx.author.id,
      source: "set-work-pays-from-sector",
      reason: "Set work pays from sector",
      metadata: {
        field: "workPaysFromSector",
        before: before.work.workPaysFromSector,
        after: sector,
        correlationId: ctx.interaction.id,
      },
    });

    await ctx.write({
      content: `Work payouts now draw from **${sector}** sector.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
