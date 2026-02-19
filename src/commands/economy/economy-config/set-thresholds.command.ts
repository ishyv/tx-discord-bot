/**
 * Economy Config Set Thresholds Subcommand.
 *
 * Purpose: Admin-only set transfer alert thresholds (warning, alert, critical).
 * Audited as CONFIG_UPDATE.
 */

import { HelpDoc, HelpCategory } from "@/modules/help";
import {
  Declare,
  Options,
  SubCommand,
  createIntegerOption,
  type GuildCommandContext,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { checkEconomyPermission, EconomyPermissionLevel } from "@/modules/economy/permissions";
import { guildEconomyRepo, economyAuditRepo } from "@/modules/economy";

const options = {
  warning: createIntegerOption({
    description: "Warning threshold (e.g. 100000)",
    required: true,
    min_value: 0,
  }),
  alert: createIntegerOption({
    description: "Alert threshold (e.g. 1000000)",
    required: true,
    min_value: 0,
  }),
  critical: createIntegerOption({
    description: "Critical threshold (e.g. 10000000)",
    required: true,
    min_value: 0,
  }),
};

@HelpDoc({
  command: "economy-config thresholds",
  category: HelpCategory.Economy,
  description: "Set transfer alert thresholds for audit logging (admin only)",
  usage: "/economy-config thresholds <warn> <flag>",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "thresholds",
  description: "Set transfer alert thresholds (admin only)",
})
@Options(options)
export default class EconomyConfigSetThresholdsCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

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

    const warning = Math.max(0, ctx.options.warning);
    const alert = Math.max(0, ctx.options.alert);
    const critical = Math.max(0, ctx.options.critical);

    const beforeResult = await guildEconomyRepo.ensure(guildId);
    if (beforeResult.isErr()) {
      await ctx.write({
        content: "Failed to load current config.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const before = beforeResult.unwrap();

    const updateResult = await guildEconomyRepo.updateThresholds(guildId, {
      warning,
      alert,
      critical,
    });
    if (updateResult.isErr()) {
      await ctx.write({
        content: "Failed to update thresholds.",
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
      source: "economy-config set thresholds",
      metadata: {
        correlationId,
        key: "thresholds",
        before: { ...before.thresholds },
        after: { ...after.thresholds },
      },
    });

    await ctx.write({
      content:
        `Thresholds updated: **warning** ${after.thresholds.warning.toLocaleString()}, ` +
        `**alert** ${after.thresholds.alert.toLocaleString()}, **critical** ${after.thresholds.critical.toLocaleString()}.`,
    });
  }
}
