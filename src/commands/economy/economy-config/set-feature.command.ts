/**
 * Economy Config Set Feature Subcommand.
 *
 * Purpose: Admin-only toggle for economy feature flags (kill switches).
 * Audited as CONFIG_UPDATE with before/after and correlationId.
 */

import {
  Declare,
  Options,
  SubCommand,
  createStringOption,
  createBooleanOption,
  type GuildCommandContext,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { checkEconomyPermission } from "@/modules/economy/permissions";
import { guildEconomyRepo, economyAuditRepo } from "@/modules/economy";
import type { EconomyFeatureFlags } from "@/modules/economy/guild/types";

const VALID_FEATURES: (keyof EconomyFeatureFlags)[] = [
  "coinflip",
  "trivia",
  "rob",
  "voting",
  "crafting",
  "store",
];

const options = {
  name: createStringOption({
    description: `Feature name (${VALID_FEATURES.join(", ")})`,
    required: true,
    choices: VALID_FEATURES.map((f) => ({ name: f, value: f })),
  }),
  enabled: createBooleanOption({
    description: "Enable (true) or disable (false) the feature",
    required: true,
  }),
};

@Declare({
  name: "feature",
  description: "Enable/disable economy features (admin kill switches)",
})
@Options(options)
export default class EconomyConfigSetFeatureCommand extends SubCommand {
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

    const featureName = ctx.options.name as keyof EconomyFeatureFlags;
    const enabled = ctx.options.enabled;

    if (!VALID_FEATURES.includes(featureName)) {
      await ctx.write({
        content: `Invalid feature. Valid options: ${VALID_FEATURES.join(", ")}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get current config for audit
    const beforeResult = await guildEconomyRepo.ensure(guildId);
    if (beforeResult.isErr()) {
      await ctx.write({
        content: "Failed to load current config.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const before = beforeResult.unwrap();
    const beforeValue = before.features[featureName];

    // Update feature flag
    const updateResult = await guildEconomyRepo.updateFeatureFlags(guildId, {
      [featureName]: enabled,
    });
    if (updateResult.isErr()) {
      await ctx.write({
        content: "Failed to update feature flag.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const after = updateResult.unwrap();

    // Create audit entry
    const correlationId = `config_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await economyAuditRepo.create({
      operationType: "config_update",
      actorId: ctx.author.id,
      targetId: guildId,
      guildId,
      source: `economy-config set feature ${featureName}`,
      metadata: {
        correlationId,
        key: `features.${featureName}`,
        before: { [featureName]: beforeValue },
        after: { [featureName]: after.features[featureName] },
      },
    });

    const emoji = enabled ? "✅" : "🚫";
    const action = enabled ? "enabled" : "disabled";
    await ctx.write({
      content: `${emoji} Feature **${featureName}** has been ${action}.`,
    });
  }
}
