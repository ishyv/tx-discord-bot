/**
 * Event Launch Week Command (Phase 10d).
 *
 * Purpose: Quick-start the Launch Week event with preset modifiers.
 * Permission: ManageGuild (admin).
 */

import {
  Command,
  Declare,
  Embed,
  type CommandContext,
} from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { EmbedColors } from "seyfert/lib/common";
import { MessageFlags } from "seyfert/lib/types";
import {
  eventService,
  economyAuditRepo,
  LAUNCH_WEEK_EVENT,
  getModifierSummary,
} from "@/modules/economy";
import { buildErrorEmbed, checkEconomyPermission, EconomyPermissionLevel } from "@/modules/economy";

@HelpDoc({
  command: "event-launch-week",
  category: HelpCategory.Economy,
  description: "Start the Launch Week event with preset economy bonuses (admin only)",
  usage: "/event-launch-week",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "event-launch-week",
  description: "Start the Launch Week event with preset bonuses (Admin only)",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageGuild"],
})
export default class EventLaunchWeekCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId;
    const userId = ctx.author?.id;

    if (!guildId) {
      await ctx.write({
        embeds: [buildErrorEmbed("This command can only be used in a server.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!userId) {
      await ctx.write({
        embeds: [buildErrorEmbed("Could not identify user.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check admin permission
    const hasAdmin = await checkEconomyPermission(
      ctx.member,
      EconomyPermissionLevel.ADMIN,
    );
    if (!hasAdmin) {
      await ctx.write({
        embeds: [buildErrorEmbed("You need admin permission to start events.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await ctx.write({
      content: "🚀 Starting Launch Week event...",
      flags: MessageFlags.Ephemeral,
    });

    // Start the Launch Week event using the preset
    const result = await eventService.startEvent(
      guildId,
      LAUNCH_WEEK_EVENT,
      userId,
    );

    if (result.isErr()) {
      const error = result.error;
      await ctx.editResponse({
        content: null,
        embeds: [buildErrorEmbed(error.message || "Failed to start Launch Week event.")],
      });
      return;
    }

    const eventData = result.unwrap();

    // Audit
    const correlationId = `launch_week_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await economyAuditRepo.create({
      operationType: "config_update",
      actorId: userId,
      targetId: guildId,
      guildId,
      source: "event launch-week",
      reason: `Started Launch Week event (preset)`,
      metadata: {
        correlationId,
        preset: "launch-week",
        eventName: eventData.name,
        startsAt: eventData.startsAt,
        endsAt: eventData.endsAt,
        modifiers: eventData.modifiers,
      },
    });

    // Build response embed
    const embed = new Embed()
      .setColor(EmbedColors.Green)
      .setTitle("🚀 Launch Week Started!")
      .setDescription(
        "**The economy system is now live!**\n\n" +
        "New players can complete the **Starter Questline** for bonus rewards, " +
        "and everyone enjoys boosted rewards for the next 7 days!"
      )
      .addFields(
        {
          name: "⏱️ Duration",
          value: "7 days (168 hours)",
          inline: true,
        },
        {
          name: "📈 Active Bonuses",
          value: getModifierSummary(eventData.modifiers),
          inline: false,
        },
        {
          name: "📚 New Player Quests",
          value: "Use `/quests` to view the **Starter** questline!",
          inline: false,
        },
      )
      .setFooter({ text: "Use /event to view status • /event-stop to end early" })
      .setTimestamp();

    if (eventData.endsAt) {
      embed.addFields({
        name: "🔚 Ends",
        value: `<t:${Math.floor(eventData.endsAt.getTime() / 1000)}:R>`,
        inline: true,
      });
    }

    await ctx.editResponse({
      content: null,
      embeds: [embed],
    });
  }
}
