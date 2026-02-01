/**
 * Economy Config Set Store Subcommand (Phase 9d).
 *
 * Purpose: Admin-only configuration for store rotation, featured items, and pricing modifiers.
 */

import {
  Declare,
  Options,
  SubCommand,
  createNumberOption,
  createStringOption,
  type GuildCommandContext,
  Embed,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { EmbedColors } from "seyfert/lib/common";
import { checkEconomyPermission } from "@/modules/economy/permissions";
import { economyAuditRepo, buildErrorEmbed } from "@/modules/economy";
import { storeRotationService } from "@/modules/economy/store/rotation";

const options = {
  action: createStringOption({
    description: "Action to perform",
    required: true,
    choices: [
      { name: "📊 View current config", value: "view" },
      { name: "🔢 Set daily featured count", value: "featured-count" },
      { name: "💰 Set featured discount", value: "featured-discount" },
      { name: "📈 Set scarcity markup", value: "scarcity-markup" },
      { name: "🔄 Set rotation mode", value: "rotation-mode" },
      { name: "⚡ Toggle legendary slot", value: "legendary-slot" },
      { name: "🔄 Force rotation now", value: "rotate-now" },
    ],
  }),
  value: createStringOption({
    description: "Value for the setting (when needed)",
    required: false,
  }),
  numeric_value: createNumberOption({
    description: "Numeric value (0-1 for percentages)",
    required: false,
    min_value: 0,
    max_value: 100,
  }),
};

@Declare({
  name: "store",
  description: "Configure store rotation, featured items, and pricing",
})
@Options(options)
export default class EconomyConfigSetStoreCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        embeds: [buildErrorEmbed("This command can only be used in a server.")],
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
        embeds: [buildErrorEmbed("You need admin permission to change store config.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const action = ctx.options.action;
    const value = ctx.options.value;
    const numericValue = ctx.options.numeric_value;

    // Handle view action
    if (action === "view") {
      await this.viewConfig(ctx, guildId);
      return;
    }

    // Handle rotate-now action
    if (action === "rotate-now") {
      await this.forceRotation(ctx, guildId);
      return;
    }

    // Build config update based on action
    const update: Record<string, unknown> = {};

    switch (action) {
      case "featured-count": {
        const count = numericValue ? Math.round(numericValue) : (value ? parseInt(value, 10) : NaN);
        if (isNaN(count) || count < 1 || count > 10) {
          await ctx.write({
            embeds: [buildErrorEmbed("Invalid count. Use a number between 1 and 10.")],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        update.dailyFeaturedCount = count;
        break;
      }

      case "featured-discount": {
        const discount = numericValue !== undefined ? numericValue : (value ? parseFloat(value) : NaN);
        if (isNaN(discount) || discount < 0 || discount > 1) {
          await ctx.write({
            embeds: [buildErrorEmbed("Invalid discount. Use a decimal between 0 and 1 (e.g., 0.15 for 15%).")],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        update.featuredDiscountPct = discount;
        break;
      }

      case "scarcity-markup": {
        const markup = numericValue !== undefined ? numericValue : (value ? parseFloat(value) : NaN);
        if (isNaN(markup) || markup < 0 || markup > 2) {
          await ctx.write({
            embeds: [buildErrorEmbed("Invalid markup. Use a decimal between 0 and 2 (e.g., 0.25 for 25%).")],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        update.scarcityMarkupPct = markup;
        break;
      }

      case "rotation-mode": {
        const mode = value?.toLowerCase();
        if (!mode || !["manual", "auto", "disabled"].includes(mode)) {
          await ctx.write({
            embeds: [buildErrorEmbed("Invalid mode. Use: manual, auto, or disabled.")],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        update.mode = mode as "manual" | "auto" | "disabled";
        break;
      }

      case "legendary-slot": {
        const enabled = value?.toLowerCase() === "true" || value?.toLowerCase() === "yes" || numericValue === 1;
        update.hasLegendarySlot = enabled;
        break;
      }

      default: {
        await ctx.write({
          embeds: [buildErrorEmbed(`Unknown action: ${action}`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    // Apply update
    const updateResult = await storeRotationService.updateConfig(guildId, update);
    if (updateResult.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed("Failed to update configuration.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Create audit entry
    const correlationId = `config_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await economyAuditRepo.create({
      operationType: "config_update",
      actorId: ctx.author.id,
      targetId: guildId,
      guildId,
      source: "economy-config set store",
      metadata: {
        correlationId,
        action,
        changes: update,
      },
    });

    // Show updated config
    await this.viewConfig(ctx, guildId, `✅ Configuration updated: ${action}`);
  }

  private async viewConfig(
    ctx: GuildCommandContext,
    guildId: string,
    title?: string,
  ) {
    const rotationResult = await storeRotationService.getRotation(guildId);
    
    if (rotationResult.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed("Failed to load configuration.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const rotation = rotationResult.unwrap();
    const config = rotation.config;

    const embed = new Embed()
      .setColor(EmbedColors.Blue)
      .setTitle(title || "🏪 Store Rotation Configuration")
      .addFields(
        {
          name: "🔄 Rotation Mode",
          value: config.mode,
          inline: true,
        },
        {
          name: "🔢 Daily Featured Count",
          value: String(config.dailyFeaturedCount),
          inline: true,
        },
        {
          name: "🔥 Legendary Slot",
          value: config.hasLegendarySlot ? "✅ Enabled" : "❌ Disabled",
          inline: true,
        },
        {
          name: "💰 Featured Discount",
          value: `${(config.featuredDiscountPct * 100).toFixed(0)}%`,
          inline: true,
        },
        {
          name: "📈 Scarcity Markup",
          value: `${(config.scarcityMarkupPct * 100).toFixed(0)}%`,
          inline: true,
        },
        {
          name: "📊 Scarcity Threshold",
          value: String(config.scarcityThreshold),
          inline: true,
        },
        {
          name: "⏱️ Rotation Hours",
          value: String(config.rotationHours),
          inline: true,
        },
        {
          name: "🕐 Next Rotation",
          value: rotation.nextRotationAt.toLocaleString(),
          inline: false,
        }
      )
      .setFooter({ text: "Use /economy-config store action:<name> value:<value> to change" });

    if (rotation.featured.length > 0) {
      embed.addFields({
        name: "⭐ Currently Featured",
        value: `${rotation.featured.length} items (use /store-featured to view)`,
        inline: false,
      });
    }

    await ctx.write({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }

  private async forceRotation(ctx: GuildCommandContext, guildId: string) {
    const result = await storeRotationService.rotateFeatured({
      guildId,
      force: true,
    });

    if (result.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed(`Failed to rotate: ${result.error.message}`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const rotation = result.unwrap();

    // Create audit entry
    const correlationId = `rotation_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await economyAuditRepo.create({
      operationType: "config_update",
      actorId: ctx.author.id,
      targetId: guildId,
      guildId,
      source: "economy-config store rotate-now",
      metadata: {
        correlationId,
        previousCount: rotation.previousFeatured.length,
        newCount: rotation.newFeatured.length,
        wasDue: rotation.wasDue,
      },
    });

    const embed = new Embed()
      .setColor(EmbedColors.Green)
      .setTitle("🔄 Featured Items Rotated")
      .setDescription(
        `Successfully rotated featured items.\n` +
        `Next rotation: ${rotation.nextRotationAt.toLocaleString()}`
      )
      .addFields({
        name: "New Featured Items",
        value: rotation.newFeatured
          .map((f) => `${f.slotType === "legendary" ? "🔥" : "⭐"} ${f.itemId} (${f.featuredPrice} coins)`)
          .join("\n") || "None",
        inline: false,
      });

    await ctx.write({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }
}
