import { guildEconomyRepo } from "@/modules/economy";
/**
 * Set Daily Fee Sector Command
 *
 * Purpose: Admin command to set the sector for daily claim fee deposit.
 * Audited as config_update with before/after and correlationId.
 */
import { HelpDoc, HelpCategory } from "@/modules/help";
import {
  Declare,
  Options,
  SubCommand,
  type GuildCommandContext,
  createStringOption,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { checkEconomyPermission, EconomyPermissionLevel } from "@/modules/economy/permissions";
import { guildEconomyService, economyAuditRepo } from "@/modules/economy";
import type { EconomySector } from "@/modules/economy";

const SECTORS: EconomySector[] = ["global", "works", "trade", "tax"];

const options = {
  sector: createStringOption({
    description: "Sector to deposit daily fee",
    required: true,
    choices: SECTORS.map((s) => ({ name: s, value: s })),
  }),
};

@HelpDoc({
  command: "economy-config set-daily-fee-sector",
  category: HelpCategory.Economy,
  description: "Set the sector where daily claim fees are deposited",
  usage: "/economy-config set-daily-fee-sector <sector>",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "set-daily-fee-sector",
  description: "Set the sector for daily claim fee deposit",
})
@Options(options)
export default class SetDailyFeeSectorCommand extends SubCommand {
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
        content: "You need admin permission to set the daily fee sector.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const sector = ctx.options.sector as EconomySector;
    if (!SECTORS.includes(sector)) {
      await ctx.write({
        content: `Invalid sector. Valid options: ${SECTORS.join(", ")}`,
      });
      return;
    }
    const configResult = await guildEconomyService.getConfig(guildId);
    if (configResult.isErr()) {
      await ctx.write({
        content: "Failed to load economy config.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const config = configResult.unwrap();
    const before = { ...config.daily };
    const after = { ...config.daily, dailyFeeSector: sector };
    const updateResult = await guildEconomyRepo.updateDailyConfig(
      guildId,
      after,
    );
    if (updateResult.isErr()) {
      await ctx.write({
        content: "Failed to update daily fee sector.",
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
      source: "set-daily-fee-sector",
      reason: "Set daily fee sector",
      metadata: {
        field: "dailyFeeSector",
        before: before.dailyFeeSector ?? "tax",
        after: sector,
        correlationId: ctx.interaction.id,
      },
    });
    await ctx.write({
      content: `Daily claim fee sector set to **${sector}**.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
