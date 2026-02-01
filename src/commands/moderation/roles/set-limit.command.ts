/**
 * Role Set Limit Command.
 *
 * Purpose: Configure usage limits (rate limits) for moderation actions on managed roles.
 */
import type { GuildCommandContext } from "seyfert";
import {
  createIntegerOption,
  createStringOption,
  Declare,
  Embed,
  Options,
  SubCommand,
} from "seyfert";
import { UIColors } from "@/modules/ui/design-system";

import { GuildRolesRepo } from "@/db/repositories/guild-roles";
import {
  buildLimitRecord,
  formatLimitRecord,
  parseLimitWindowInput,
  requireGuildContext,
  resolveActionInput,
} from "./shared";

const options = {
  key: createStringOption({
    description: "Managed role key",
    required: true,
  }),
  action: createStringOption({
    description: "Moderation action (kick, ban, warn, timeout, purge)",
    required: true,
  }),
  uses: createIntegerOption({
    description: "Amount of allowed uses in the window",
    required: true,
    min_value: 1,
  }),
  window: createStringOption({
    description: "Time window (e.g. 10m, 1h, 6h, 24h, 7d)",
    required: true,
    min_length: 1,
  }),
};

@Declare({
  name: "set-limit",
  description: "Configure a usage limit for an action",
})
@Options(options)
export default class RoleSetLimitCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const context = await requireGuildContext(ctx);
    if (!context) return;

    const key = ctx.options.key.trim();
    if (!key) {
      const embed = new Embed({
        title: "Invalid key",
        description: "Indicate the managed role key you want to edit.",
        color: UIColors.error,
      });
      await ctx.write({ embeds: [embed] });
      return;
    }

    const actionResult = resolveActionInput(ctx.options.action);
    if ("error" in actionResult) {
      const embed = new Embed({
        title: "Invalid action",
        description: actionResult.error,
        color: UIColors.error,
      });
      await ctx.write({ embeds: [embed] });
      return;
    }
    const action = actionResult.action;

    const parsedWindow = parseLimitWindowInput(ctx.options.window);
    if (!parsedWindow) {
      const embed = new Embed({
        title: "Invalid window",
        description: "Use a valid format like 10m, 1h, 6h, 24h or 7d.",
        color: UIColors.error,
      });
      await ctx.write({ embeds: [embed] });
      return;
    }

    // Ensure role exists
    const rolesRes = await GuildRolesRepo.read(context.guildId);
    const roleRec = rolesRes.isOk() ? (rolesRes.unwrap() as any)[key] : null;
    if (!roleRec) {
      const embed = new Embed({
        title: "Role not found",
        description:
          "There is no registered configuration with that key. Check the name and try again.",
        color: UIColors.error,
      });
      await ctx.write({ embeds: [embed] });
      return;
    }

    const uses = Math.max(0, Math.floor(ctx.options.uses));
    const limitRecord = buildLimitRecord(uses, parsedWindow.window);

    await GuildRolesRepo.setLimit(
      context.guildId,
      key,
      action.key,
      limitRecord,
    ).then((r) => r.unwrap());

    const updatedRes = await GuildRolesRepo.read(context.guildId);
    const updated = updatedRes.isOk()
      ? (updatedRes.unwrap() as any)[key]
      : null;
    const configuredLimits = Object.keys(
      (updated?.limits ?? {}) as Record<string, unknown>,
    ).length;

    const embed = new Embed({
      title: "Limit updated",
      color: UIColors.info,
      fields: [
        { name: "Role", value: key },
        { name: "Action", value: action.key },
        { name: "Limit", value: formatLimitRecord(limitRecord) },
        { name: "Configured limits", value: configuredLimits.toString() },
      ],
    });

    await ctx.write({ embeds: [embed] });
  }
}
