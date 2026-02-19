/**
 * Economy Audit Recent Subcommand.
 *
 * Purpose: Query recent audit entries with filters; output paginated, compact.
 * Permission: mod or admin.
 */

import { HelpDoc, HelpCategory } from "@/modules/help";
import {
  Declare,
  Embed,
  Options,
  SubCommand,
  createIntegerOption,
  createStringOption,
  createUserOption,
  type GuildCommandContext,
} from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import { MessageFlags } from "seyfert/lib/types";
import { checkEconomyPermission, EconomyPermissionLevel } from "@/modules/economy/permissions";
import { economyAuditRepo } from "@/modules/economy";
import type { AuditOperationType } from "@/modules/economy/audit/types";

const OPERATION_CHOICES: { name: string; value: AuditOperationType }[] = [
  { name: "Currency adjust", value: "currency_adjust" },
  { name: "Currency transfer", value: "currency_transfer" },
  { name: "Item grant", value: "item_grant" },
  { name: "Item remove", value: "item_remove" },
  { name: "Item purchase", value: "item_purchase" },
  { name: "Item sell", value: "item_sell" },
  { name: "Config update", value: "config_update" },
  { name: "Daily claim", value: "daily_claim" },
  { name: "Work claim", value: "work_claim" },
  { name: "Rollback", value: "rollback" },
];

const MAX_LIMIT = 25;

const options = {
  target: createUserOption({
    description: "Filter by target user",
    required: false,
  }),
  actor: createUserOption({
    description: "Filter by actor user",
    required: false,
  }),
  operation: createStringOption({
    description: "Filter by operation type",
    required: false,
    choices: OPERATION_CHOICES,
  }),
  correlation_id: createStringOption({
    description: "Filter by correlation ID",
    required: false,
  }),
  since_days: createIntegerOption({
    description: "Only entries from the last N days",
    required: false,
    min_value: 1,
    max_value: 365,
  }),
  limit: createIntegerOption({
    description: `Max entries to show (1-${MAX_LIMIT})`,
    required: false,
    min_value: 1,
    max_value: MAX_LIMIT,
  }),
  page: createIntegerOption({
    description: "Page number (0-based)",
    required: false,
    min_value: 0,
  }),
};

@HelpDoc({
  command: "economy-audit recent",
  category: HelpCategory.Economy,
  description: "Show recent economy audit entries with optional filters",
  usage: "/economy-audit recent [user] [operation] [limit] [page]",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "recent",
  description: "Show recent audit entries with optional filters",
})
@Options(options)
export default class EconomyAuditRecentCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const hasMod = await checkEconomyPermission(
      ctx.member,
      EconomyPermissionLevel.MOD,
    );
    if (!hasMod) {
      await ctx.write({
        content: "You need mod or admin permission to query the audit log.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const limit = Math.min(MAX_LIMIT, Math.max(1, ctx.options.limit ?? 10));
    const page = Math.max(0, ctx.options.page ?? 0);
    const sinceDays = ctx.options.since_days;

    const fromDate = sinceDays
      ? new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
      : undefined;

    const query = {
      guildId,
      targetId: ctx.options.target?.id,
      actorId: ctx.options.actor?.id,
      operationType: ctx.options.operation as AuditOperationType | undefined,
      correlationId: ctx.options.correlation_id,
      fromDate,
      page,
      pageSize: limit,
    };

    const result = await economyAuditRepo.query(query);
    if (result.isErr()) {
      await ctx.write({
        content: "Failed to query audit log.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { entries, total, hasMore } = result.unwrap();

    const lines = entries.map((e) => {
      const ts = e.timestamp.toISOString().slice(0, 16).replace("T", " ");
      const op = e.operationType;
      const actorTarget =
        e.actorId === e.targetId ? e.actorId : `${e.actorId}→${e.targetId}`;
      const amount =
        e.currencyData?.delta != null
          ? ` ${e.currencyData.delta >= 0 ? "+" : ""}${e.currencyData.delta} ${e.currencyData.currencyId ?? ""}`
          : "";
      const corr = (e.metadata as { correlationId?: string } | undefined)
        ?.correlationId;
      const corrStr = corr ? ` [${corr.slice(-8)}]` : "";
      return `\`${ts}\` **${op}** ${actorTarget}${amount}${corrStr}`;
    });

    const embed = new Embed()
      .setColor(EmbedColors.Blue)
      .setTitle("Economy audit (recent)")
      .setDescription(
        lines.length > 0 ? lines.join("\n") : "No entries match the filters.",
      )
      .addFields(
        {
          name: "Page",
          value: `${page + 1} (${entries.length} of ${total} total)`,
          inline: true,
        },
        {
          name: "Has more",
          value: hasMore ? "Yes" : "No",
          inline: true,
        },
      );

    await ctx.write({ embeds: [embed] });
  }
}
