/**
 * Event Command (Phase 9e).
 *
 * Purpose: View, start, and stop guild events with modifiers.
 * Commands: /event (view), /event start, /event stop
 */

import {
  Command,
  Declare,
  Options,
  type GuildCommandContext,
  createStringOption,
  createNumberOption,
  createIntegerOption,
  Embed,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { EmbedColors } from "seyfert/lib/common";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
  eventService,
  economyAuditRepo,
  buildErrorEmbed,
  checkEconomyPermission,
} from "@/modules/economy";
import { getModifierSummary } from "@/modules/economy/events/types";

const startOptions = {
  name: createStringOption({
    description: "Event name",
    required: true,
    max_length: 100,
  }),
  description: createStringOption({
    description: "Event description (optional)",
    required: false,
    max_length: 500,
  }),
  duration: createIntegerOption({
    description: "Event duration in hours (optional, indefinite if not set)",
    required: false,
    min_value: 1,
    max_value: 168, // 1 week max
  }),
  xp_multiplier: createNumberOption({
    description: "XP multiplier (e.g., 1.5 for 50% more XP)",
    required: false,
    min_value: 0.1,
    max_value: 5,
  }),
  daily_bonus: createNumberOption({
    description: "Daily reward bonus % (0-1, e.g., 0.25 for 25%)",
    required: false,
    min_value: 0,
    max_value: 2,
  }),
  work_bonus: createNumberOption({
    description: "Work reward bonus % (0-1, e.g., 0.25 for 25%)",
    required: false,
    min_value: 0,
    max_value: 2,
  }),
  trivia_bonus: createNumberOption({
    description: "Trivia reward bonus % (0-1, e.g., 0.25 for 25%)",
    required: false,
    min_value: 0,
    max_value: 2,
  }),
  store_discount: createNumberOption({
    description: "Store discount % (0-1, e.g., 0.20 for 20% off)",
    required: false,
    min_value: 0,
    max_value: 0.5, // Max 50% discount
  }),
  quest_bonus: createNumberOption({
    description: "Quest reward bonus % (0-1, e.g., 0.25 for 25%)",
    required: false,
    min_value: 0,
    max_value: 2,
  }),
  crafting_reduction: createNumberOption({
    description: "Crafting cost reduction % (0-1, e.g., 0.15 for 15% off)",
    required: false,
    min_value: 0,
    max_value: 0.5,
  }),
};

@Declare({
  name: "event",
  description: "View or manage guild events with special modifiers",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 3000,
  uses: { default: 1 },
})
export default class EventCommand extends Command {
  async run(ctx: GuildCommandContext) {
    // Default: view current event
    await viewEvent(ctx);
  }
}

@Declare({
  name: "event-start",
  description: "Start a new guild event (Admin only)",
  defaultMemberPermissions: ["ManageGuild"],
})
@Options(startOptions)
export class EventStartCommand extends Command {
  async run(ctx: GuildCommandContext<typeof startOptions>) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;

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
        embeds: [buildErrorEmbed("You need admin permission to manage events.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Build modifiers from options
    const modifiers: Record<string, number> = {};
    
    if (ctx.options.xp_multiplier !== undefined) {
      modifiers.xpMultiplier = ctx.options.xp_multiplier;
    }
    if (ctx.options.daily_bonus !== undefined) {
      modifiers.dailyRewardBonusPct = ctx.options.daily_bonus;
    }
    if (ctx.options.work_bonus !== undefined) {
      modifiers.workRewardBonusPct = ctx.options.work_bonus;
    }
    if (ctx.options.trivia_bonus !== undefined) {
      modifiers.triviaRewardBonusPct = ctx.options.trivia_bonus;
    }
    if (ctx.options.store_discount !== undefined) {
      modifiers.storeDiscountPct = ctx.options.store_discount;
    }
    if (ctx.options.quest_bonus !== undefined) {
      modifiers.questRewardBonusPct = ctx.options.quest_bonus;
    }
    if (ctx.options.crafting_reduction !== undefined) {
      modifiers.craftingCostReductionPct = ctx.options.crafting_reduction;
    }

    // Start event
    const result = await eventService.startEvent(
      guildId,
      {
        name: ctx.options.name,
        description: ctx.options.description,
        durationHours: ctx.options.duration,
        modifiers,
      },
      userId,
    );

    if (result.isErr()) {
      const error = result.error;
      await ctx.write({
        embeds: [buildErrorEmbed(error.message || "Failed to start event.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const eventData = result.unwrap();

    // Audit
    const correlationId = `event_start_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await economyAuditRepo.create({
      operationType: "config_update",
      actorId: userId,
      targetId: guildId,
      guildId,
      source: "event start",
      reason: `Started event: ${eventData.name}`,
      metadata: {
        correlationId,
        eventName: eventData.name,
        startsAt: eventData.startsAt,
        endsAt: eventData.endsAt,
        modifiers: eventData.modifiers,
      },
    });

    // Build response embed
    const embed = new Embed()
      .setColor(EmbedColors.Green)
      .setTitle("🎉 Event Started!")
      .setDescription(`**${eventData.name}** is now active!`);

    if (ctx.options.description) {
      embed.addFields({ name: "Description", value: ctx.options.description, inline: false });
    }

    const modifierSummary = getModifierSummary(eventData.modifiers);
    if (modifierSummary !== "No modifiers") {
      embed.addFields({ name: "Active Modifiers", value: modifierSummary, inline: false });
    }

    if (eventData.endsAt) {
      const duration = ctx.options.duration || 0;
      embed.addFields({
        name: "Duration",
        value: `${duration} hour${duration === 1 ? "" : "s"} (ends <t:${Math.floor(eventData.endsAt.getTime() / 1000)}:R>)`,
        inline: true,
      });
    } else {
      embed.addFields({ name: "Duration", value: "Indefinite", inline: true });
    }

    embed.setFooter({ text: "Use /event to view status • /event-stop to end early" });

    await ctx.write({
      embeds: [embed],
    });
  }
}

@Declare({
  name: "event-stop",
  description: "Stop the current guild event (Admin only)",
  defaultMemberPermissions: ["ManageGuild"],
})
export class EventStopCommand extends Command {
  async run(ctx: GuildCommandContext) {
    const guildId = ctx.guildId;
    const userId = ctx.author.id;

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
        embeds: [buildErrorEmbed("You need Manage Server permission to stop events.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Stop event
    const result = await eventService.stopEvent(guildId, userId);

    if (result.isErr()) {
      const error = result.error;
      await ctx.write({
        embeds: [buildErrorEmbed(error.message || "Failed to stop event.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const stopData = result.unwrap();

    // Format duration
    const hours = Math.floor(stopData.duration / (1000 * 60 * 60));
    const minutes = Math.floor((stopData.duration % (1000 * 60 * 60)) / (1000 * 60));
    const durationText = hours > 0 
      ? `${hours}h ${minutes}m` 
      : `${minutes}m`;

    // Audit
    const correlationId = `event_stop_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await economyAuditRepo.create({
      operationType: "config_update",
      actorId: userId,
      targetId: guildId,
      guildId,
      source: "event stop",
      reason: "Stopped event",
      metadata: {
        correlationId,
        stoppedAt: stopData.stoppedAt,
        duration: stopData.duration,
      },
    });

    const embed = new Embed()
      .setColor(EmbedColors.Orange)
      .setTitle("🛑 Event Stopped")
      .setDescription("The event has been stopped. All modifiers have been disabled.")
      .addFields(
        { name: "Duration", value: durationText, inline: true },
        { name: "Stopped At", value: `<t:${Math.floor(stopData.stoppedAt.getTime() / 1000)}:f>`, inline: true },
      )
      .setFooter({ text: "Use /event-start to begin a new event" });

    await ctx.write({
      embeds: [embed],
    });
  }
}

async function viewEvent(ctx: GuildCommandContext) {
  const guildId = ctx.guildId;

  if (!guildId) {
    await ctx.write({
      embeds: [buildErrorEmbed("This command can only be used in a server.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const statusResult = await eventService.getEventStatus(guildId);

  if (statusResult.isErr()) {
    await ctx.write({
      embeds: [buildErrorEmbed("Could not retrieve event status.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const status = statusResult.unwrap();

  if (!status.active) {
    const embed = new Embed()
      .setColor(EmbedColors.Grey)
      .setTitle("📅 Current Event")
      .setDescription("No event is currently active.\n\nAdmins can start an event with `/event-start`");
    
    await ctx.write({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const embed = new Embed()
    .setColor(EmbedColors.Gold)
    .setTitle(`🎉 ${status.name}`);

  if (status.description) {
    embed.setDescription(status.description);
  }

  const modifierSummary = getModifierSummary(status.modifiers);
  if (modifierSummary !== "No modifiers") {
    embed.addFields({ name: "Active Modifiers", value: modifierSummary, inline: false });
  }

  if (status.timeRemaining && status.timeRemaining > 0) {
    const hours = Math.floor(status.timeRemaining / (1000 * 60 * 60));
    const minutes = Math.floor((status.timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
    embed.addFields({
      name: "⏱️ Time Remaining",
      value: `${hours}h ${minutes}m`,
      inline: true,
    });
  }

  if (status.eventCurrency) {
    embed.addFields({
      name: "Event Currency",
      value: `${status.eventCurrency.emoji} ${status.eventCurrency.name}`,
      inline: true,
    });
  }

  if (status.startedAt) {
    embed.addFields({
      name: "Started",
      value: `<t:${Math.floor(status.startedAt.getTime() / 1000)}:R>`,
      inline: true,
    });
  }

  embed.setFooter({ text: "Admins: /event-stop to end early" });

  await ctx.write({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}
