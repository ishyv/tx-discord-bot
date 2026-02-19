/**
 * Set XP Config Command.
 *
 * Purpose: Admin command to configure XP amounts and cooldowns per source.
 * Audited as config_update with before/after and correlationId.
 */

import { HelpDoc, HelpCategory } from "@/modules/help";
import {
  Declare,
  Options,
  SubCommand,
  type GuildCommandContext,
  createIntegerOption,
  createStringOption,
  createBooleanOption,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { checkEconomyPermission, EconomyPermissionLevel } from "@/modules/economy/permissions";
import { guildEconomyRepo, economyAuditRepo } from "@/modules/economy";
import type { ProgressionSourceOp } from "@/modules/economy";

const sourceChoices = [
  { name: "daily_claim", value: "daily_claim" },
  { name: "work_claim", value: "work_claim" },
  { name: "store_buy", value: "store_buy" },
  { name: "store_sell", value: "store_sell" },
  { name: "quest_complete", value: "quest_complete" },
];

const options = {
  source: createStringOption({
    description: "XP source operation to configure",
    required: true,
    choices: sourceChoices,
  }),
  amount: createIntegerOption({
    description: "XP amount for the source (>= 0)",
    required: true,
    min_value: 0,
  }),
  cooldown_seconds: createIntegerOption({
    description: "Cooldown in seconds for the source (>= 0)",
    required: false,
    min_value: 0,
  }),
  enabled: createBooleanOption({
    description: "Enable or disable progression system",
    required: false,
  }),
};

@HelpDoc({
  command: "economy-config set-xp",
  category: HelpCategory.Economy,
  description: "Set XP amount and cooldown for a progression source (admin only)",
  usage: "/economy-config set-xp <source> <amount> [cooldown]",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "set-xp",
  description: "Set XP amount/cooldown for a progression source (admin only)",
})
@Options(options)
export default class EconomyConfigSetXPCommand extends SubCommand {
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
        content: "You need admin permission to set XP config.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const source = ctx.options.source as ProgressionSourceOp;
    const amount = Number(ctx.options.amount);
    const cooldownSeconds = ctx.options.cooldown_seconds;
    const enabled = ctx.options.enabled;

    const configResult = await guildEconomyRepo.ensure(guildId);
    if (configResult.isErr()) {
      await ctx.write({
        content: "Failed to load economy config.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const before = configResult.unwrap();

    const updateResult = await guildEconomyRepo.updateProgressionConfig(
      guildId,
      {
        enabled,
        xpAmounts: { [source]: amount },
        cooldownSeconds:
          cooldownSeconds !== undefined
            ? { [source]: cooldownSeconds }
            : undefined,
      },
    );

    if (updateResult.isErr()) {
      await ctx.write({
        content: "Failed to update XP config.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await economyAuditRepo.create({
      operationType: "config_update",
      guildId,
      actorId: ctx.author.id,
      targetId: ctx.author.id,
      source: "set-xp",
      reason: "Set XP config",
      metadata: {
        sourceOp: source,
        beforeAmount: before.progression.xpAmounts[source],
        afterAmount: amount,
        beforeCooldown: before.progression.cooldownSeconds[source],
        afterCooldown:
          cooldownSeconds ?? before.progression.cooldownSeconds[source],
        enabledBefore: before.progression.enabled,
        enabledAfter: enabled ?? before.progression.enabled,
        correlationId: ctx.interaction.id,
      },
    });

    await ctx.write({
      content:
        `XP config updated for **${source}**. Amount: **${amount}** XP` +
        (cooldownSeconds !== undefined
          ? `, cooldown: **${cooldownSeconds}s**`
          : "") +
        (enabled !== undefined
          ? `, progression: **${enabled ? "enabled" : "disabled"}**`
          : "") +
        ".",
      flags: MessageFlags.Ephemeral,
    });
  }
}
