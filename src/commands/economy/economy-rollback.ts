/**
 * Economy Rollback Command (Phase 3e).
 *
 * Purpose: Roll back audited operations by correlationId (admin only).
 */

import {
  Command,
  Declare,
  Options,
  createBooleanOption,
  createStringOption,
  type CommandContext,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { checkEconomyPermission } from "@/modules/economy/permissions";
import { rollbackByCorrelationId } from "@/modules/economy";

const options = {
  correlation_id: createStringOption({
    description: "CorrelationId / transferId / transactionId to roll back",
    required: true,
  }),
  allow_mixed_guilds: createBooleanOption({
    description: "Allow rollback even if audit entries span multiple guilds",
    required: false,
  }),
};

@Declare({
  name: "economy-rollback",
  description: "Rollback economy operations by correlationId (admin only)",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageGuild"],
})
@Options(options)
export default class EconomyRollbackCommand extends Command {
  async run(ctx: CommandContext<typeof options>) {
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
        content: "You need admin permission to rollback economy operations.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const correlationId = ctx.options.correlation_id.trim();
    if (!correlationId) {
      await ctx.write({
        content: "CorrelationId cannot be empty.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const allowMixedGuilds = ctx.options.allow_mixed_guilds ?? false;

    const result = await rollbackByCorrelationId({
      correlationId,
      guildId,
      actorId: ctx.author.id,
      allowMixedGuilds,
    });

    if (result.isErr()) {
      await ctx.write({
        content: `Rollback failed: ${result.error.message}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const summary = result.unwrap();
    await ctx.write({
      content:
        `Rollback complete for **${summary.correlationId}**.\n` +
        `Entries: **${summary.entries}** | Users: **${summary.usersTouched}** | ` +
        `Sectors: **${summary.sectorsTouched}** | Stock: **${summary.stockTouched}**`,
    });
  }
}
